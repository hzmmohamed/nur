import { useCallback, useRef, useState, type ChangeEvent } from "react";
import { createMachine, assign, fromCallback } from "xstate";
import { useActorRef, useSelector } from "@xstate/react";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useParams } from "@tanstack/react-router";
import { sortBy } from "es-toolkit";
import { scenesStore, SceneStoreReact } from "@/lib/scenes.store";
import { Progress } from "./ui/progress";

// Since this environment doesn't have a bundler, we will remove the imports
// for XState and XState/React and rely on the global objects exposed by the
// script tags at the bottom of the file.

// Create the web worker logic as a string.
// This allows us to embed the worker directly into the React component
// without needing a separate file.
const workerCode = `
  importScripts('https://cdn.jsdelivr.net/npm/idb@7/build/umd.js');

  const DB_NAME = 'file-storage-db';
  const STORE_NAME = 'files';

  /**
   * Initializes the IndexedDB database.
   */
  const initDb = async () => {
    try {
      const db = await idb.openDB(DB_NAME, 1, {
        upgrade(db) {
          db.createObjectStore(STORE_NAME);
        },
      });
      return db;
    } catch (error) {
      console.error('Failed to open IndexedDB:', error);
      return null;
    }
  };

  /**
   * 
   * Saves a single file to the IndexedDB store.
   */
  const saveSingleFile = async (file, key) => {
    const db = await initDb();
    if (!db) {
      return { status: 'error', message: 'Could not initialize the database.' };
    }

    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      await tx.store.put(file, key);
      await tx.done;
      return { status: 'success', fileName: key };
    } catch (error) {
      return { status: 'error', message: 'Error saving file: ' + error.message };
    }
  };

  // Listen for messages from the main thread
  self.onmessage = async (event) => {
    const { type, payload } = event.data;

    if (type === 'START_SAVE') {
        const { files, iDBKeyPrefix } = payload;
        if (Array.isArray(files) && files.every(file => file instanceof File)) {
          postMessage({ type: 'PROGRESS_START', total: files.length });

          for (let i = 0; i < files.length; i++) {
            const file = files[i];
            postMessage({ type: 'PROGRESS_UPDATE', currentIndex: i, total: files.length, fileName: file.name });
            const result = await saveSingleFile(file, \`\${iDBKeyPrefix}_frame_\${i}\`);
            if (result.status === 'error') {
              postMessage({ type: 'ERROR', message: result.message });
              return;
            }
          }

          postMessage({ type: 'PROGRESS_COMPLETE', total: files.length });
        }
    }
  };
`;

// Define the XState machine for the file import process.
const directorySaveMachine = createMachine({
  id: "directorySaver",
  initial: "idle",
  types: {
    input: {} as {
      iDBKeyPrefix: string;
    },
    context: {} as {
      iDBKeyPrefix: string;
      directoryName: string | null;
      totalFiles: number;
      savedFiles: number;
      errorMessage: string;
      currentFileName: string;
    },
    events: {} as
      | {
          type: "SELECT_DIRECTORY";
          payload: {
            directoryName: string;
            files: File[];
          };
        }
      | {
          type: "PROGRESS_UPDATE";
          payload: {
            currentIndex: number;
            total: number;
            fileName: string;
          };
        }
      | {
          type: "PROGRESS_COMPLETE";
          payload: {
            total: number;
          };
        }
      | {
          type: "ERROR";
          payload: {
            message: string;
          };
        }
      | {
          type: "CANCEL";
        }
      | { type: "RESET" },
  },
  context: ({ input: { iDBKeyPrefix } }) => ({
    iDBKeyPrefix,
    directoryName: null,
    totalFiles: 0,
    savedFiles: 0,
    errorMessage: "",
    currentFileName: "",
  }),
  states: {
    idle: {
      on: {
        SELECT_DIRECTORY: {
          target: "saving",
          actions: assign({
            directoryName: ({ event }) => event.payload.directoryName,
            totalFiles: ({ event }) => event.payload.files.length,
            savedFiles: 0,
            errorMessage: "",
          }),
        },
      },
    },
    saving: {
      // Use an invoked callback actor to handle the web worker logic
      invoke: {
        // The src property is a function that creates the actor
        src: fromCallback(({ sendBack, input }) => {
          const worker = new Worker(
            URL.createObjectURL(
              new Blob([workerCode], { type: "application/javascript" })
            )
          );

          // Send messages from the worker back to the machine
          worker.onmessage = (event) => {
            sendBack({ type: event.data.type, payload: event.data });
          };

          // Handle errors from the worker
          worker.onerror = (error) => {
            sendBack({ type: "ERROR", payload: { message: error.message } });
          };

          // Send the initial message to the worker to start saving
          worker.postMessage({
            type: "START_SAVE",
            payload: { files: input.files, iDBKeyPrefix: input.iDBKeyPrefix },
          });

          // Return a cleanup function
          return () => {
            worker.terminate();
          };
        }),

        // The input for the invoked actor comes from the SELECT_DIRECTORY event payload
        input: ({ event, context }) => ({
          // @ts-ignore
          files: event.payload.files,
          iDBKeyPrefix: context.iDBKeyPrefix,
        }),
        // Define what to do on success and error
        onDone: {
          target: "complete",
        },
        onError: {
          target: "error",
          actions: assign({
            errorMessage: ({ event: { error } }) =>
              // @ts-ignore
              error?.message || "Something went wrong",
          }),
        },
      },
      on: {
        // These events are received from the invoked actor
        PROGRESS_UPDATE: {
          actions: assign({
            savedFiles: ({ event }) => event.payload.currentIndex + 1,
            currentFileName: ({ event }) => event.payload.fileName,
          }),
        },
        PROGRESS_COMPLETE: {
          target: "complete",
          actions: ({
            context,
            event: {
              payload: { total },
            },
          }) => {
            console.log(
              "Setting frames count",
              context,
              total,
              context.iDBKeyPrefix
            );
            scenesStore.setCell("scenes", context.iDBKeyPrefix, "framesCount", 240);
          },
        },
        ERROR: {
          target: "error",
          actions: assign({
            errorMessage: ({ event }) => event.payload.message,
          }),
        },
        // It's good practice to have a way to stop the invoked actor
        CANCEL: "idle",
      },
    },
    complete: {
      on: {
        RESET: "idle",
      },
    },
    error: {
      on: {
        RESET: "idle",
      },
    },
  },
});

// Main React component with
function ImportFramesDialogContent({ sceneId }: { sceneId: string }) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Use XState's useActorRef hook to create a root actor for the machine.
  const actor = useActorRef(directorySaveMachine, {
    input: {
      iDBKeyPrefix: sceneId,
    },
  });

  // Use the useSelector hook to efficiently select and subscribe to specific state values.
  const actorValue = useSelector(actor, (state) => state.value);
  const matches = useCallback(
    (testVal: string) => testVal === actorValue,
    [actorValue]
  );
  const context = useSelector(actor, (state) => state.context);

  /**
   * Handles the directory selection event.
   */
  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      const directoryPath = files[0].webkitRelativePath.split("/")[0];
      const fileArray = Array.from(files);

      // We only need to send a single event to the machine. The machine
      // now handles the worker creation and communication.
      actor.send({
        type: "SELECT_DIRECTORY",
        payload: {
          directoryName: directoryPath,
          files: sortBy(fileArray, [(f) => f.name.split("_")[1]]),
        },
      });
    }
  };

  /**
   * Programmatically clicks the hidden file input.
   */
  const triggerFileSelect = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  // Main UI render
  const renderStatus = () => {
    if (matches("saving")) {
      return (
        <div className="mt-6">
          <p className="text-sm font-medium text-card-foreground">
            Saving file {context.savedFiles} of {context.totalFiles}:{" "}
            {context.currentFileName}
          </p>
          <Progress value={(context.savedFiles / context.totalFiles) * 100} />
        </div>
      );
    } else if (matches("complete")) {
      return (
        <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-xl">
          <p className="text-sm font-medium text-green-600">
            Successfully saved {context.totalFiles} files from directory '
            {context.directoryName}'.
          </p>
        </div>
      );
    } else if (matches("error")) {
      return (
        <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-xl">
          <p className="text-sm font-medium text-red-600">
            Error: {context.errorMessage}
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <DialogContent
      className="min-h-1/3 max-h-3/4 max-w-md text-card-foreground bg-card overflow-y-auto scrollbar-thin scrollbar-thumb-rounded-full scrollbar-track-rounded-full  scrollbar-thumb-[#d2d2d244] scrollbar-track-[#00000000] "
      // hfahmi: Preventing interruption of the import process after it starts.
      showCloseButton={!matches("saving")}
      onEscapeKeyDown={
        !matches("saving") ? undefined : (e) => e.preventDefault()
      }
      onPointerDownOutside={
        !matches("saving") ? undefined : (e) => e.preventDefault()
      }
      onInteractOutside={
        !matches("saving") ? undefined : (e) => e.preventDefault()
      }
    >
      <DialogHeader className="pb-4">
        <DialogTitle className="text-2xl text-foreground font-bold">
          Import frames
        </DialogTitle>
        <DialogDescription>
          Select a folder to save all its files
        </DialogDescription>
      </DialogHeader>

      {/* Hidden file input element configured to select a directory */}
      <input
        type="file"
        // @ts-ignore
        webkitdirectory="true"
        directory=""
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Custom button to trigger the file input */}
      <Button
        disabled={matches("saving")}
        onClick={matches("saving") ? undefined : triggerFileSelect}
      >
        {matches("saving") ? "Saving..." : "Select and Save Directory"}
      </Button>

      {/* Display directory info and status message */}
      {context.directoryName && (
        <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-xl text-left">
          <h2 className="text-xl font-semibold text-blue-800 mb-2">
            Selected Folder:
          </h2>
          <p className="text-sm text-blue-700">{context.directoryName}</p>
        </div>
      )}

      {/* Display progress during saving */}
      {renderStatus()}
    </DialogContent>
  );
}

export const ImportFramesButton = (
  props: React.ComponentPropsWithoutRef<typeof Button>
) => {
  const { id } = useParams({ from: "/scenes/$id" });
  const framesCount =
    SceneStoreReact.useCell("scenes", id, "framesCount", scenesStore) || 0;
  const [isOpen, setIsOpen] = useState(false);
  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button {...props} disabled={framesCount > 0}>
          Import Frames
        </Button>
      </DialogTrigger>
      <ImportFramesDialogContent sceneId={id} />
    </Dialog>
  );
};
