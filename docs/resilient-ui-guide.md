# Resilient UI: A Coding Agent's Guide to States, Failures & Polish

> Every screen has more states than you think. Design for all of them.
>
> This project uses **@effect-atom/atom** for reactive state and
> **effect-machine** for complex stateful workflows. Atoms return
> `Result<A, E>` — a three-state discriminated union (`Initial`, `Success`,
> `Failure`) with a `waiting` flag. When a workflow has multiple named states,
> guarded transitions, or state-scoped side effects, use effect-machine.

---

## 1. The Core Mental Model

A UI is a **finite state machine**. Every component exists in exactly one state
at any moment. If you can't name the state, you haven't designed for it.

### Two tools, two levels of complexity

**effect-atom `Result`** — for simple fetch/mutate lifecycles (3 states):

```
Initial ──(effect runs)──> Initial(waiting) ──(ok)──> Success
                                │
                                ├──(fail)──> Failure
                                └──(refetch)──> Success(waiting) ──(ok)──> Success
                                                     └──(fail)──> Failure
```

**effect-machine** — for complex workflows with named states, guards, and
state-scoped effects:

```
Idle ──(Import)──> Reading ──(done)──> Hashing ──(done)──> Storing ──(done)──> Complete
                      │                   │                    │
                      └──(fail)───────────┴────────────────────┴──> Failed
```

### When to use which

```
How many named states does this component need?
├── 3 (idle/loading/done) → effect-atom Result. No machine needed.
├── 4+ with guarded transitions → effect-machine Machine.
└── Async lifecycle with retries → effect-atom Result + useAtomRefresh.

Does the workflow have state-scoped side effects?
├── YES (e.g., polling only while in "Active" state) → effect-machine .spawn()
└── NO → effect-atom is sufficient.
```

**The rule:** If there is an arrow between two states, there MUST be a UI for
the state at the end of that arrow. No exceptions.

---

## 2. The Five Canonical States

Every data-fetching component has exactly five possible states. In effect-atom,
`Result<A, E>` encodes most of these natively.

| # | State               | `Result` Equivalent                  | Required UI                      |
|---|---------------------|--------------------------------------|----------------------------------|
| 1 | **Idle**            | `Result.Initial` (waiting: false)    | Empty state or call-to-action    |
| 2 | **Loading**         | `Result.Initial` (waiting: true)     | Skeleton, spinner, or shimmer    |
| 3 | **Success**         | `Result.Success` (waiting: false)    | Render the data                  |
| 4 | **Error**           | `Result.Failure`                     | Error message + recovery action  |
| 5 | **Stale + Refetch** | `Result.Success` (waiting: true)     | Show data + subtle loading hint  |

### Decision Tree: Which State Am I In?

```
What is the Result?
├── Result.isInitial(r)
│   └── r.waiting?
│       ├── YES → LOADING (first fetch in progress)
│       └── NO  → IDLE (Atom.fn before first call, or initialValue not set)
├── Result.isSuccess(r)
│   └── r.waiting?
│       ├── YES → STALE + REFETCH (show data, hint at refresh)
│       └── NO  → SUCCESS (render the data)
└── Result.isFailure(r) → ERROR (show message + recovery)
```

### effect-atom: Rendering a Result

```tsx
import * as Result from "@effect-atom/atom/Result"

function renderResult<A>(result: Result.Result<A>, render: (a: A) => ReactNode) {
  if (Result.isInitial(result)) {
    return result.waiting ? <Skeleton /> : <EmptyState />
  }
  if (Result.isFailure(result)) {
    return <ErrorPanel cause={result.cause} />
  }
  // Success — may also be refetching (waiting: true)
  return (
    <>
      {result.waiting && <SubtleRefreshIndicator />}
      {render(result.value)}
    </>
  )
}
```

---

## 3. Transitions Are States

A transition between State A and State B that involves a network call, a
computation, or any async operation is **not an instant jump**. It is a
first-class state that needs its own UI.

In effect-atom, `Result.waiting` is the built-in transition flag. When an
atom is refetching, `waiting` becomes `true` while the previous value persists
in `Success` or the atom sits in `Initial(waiting: true)`.

### DO: Use effect-atom Result (automatic state tracking)

```tsx
// The atom itself is the state machine — no manual state management
const framesAtom = runtimeAtom.atom(
  Effect.gen(function* () {
    const store = yield* BlobStore
    return yield* store.listFrames()
  }),
)

// In React — Result handles idle/loading/success/error automatically
function FrameList() {
  const result = useAtomValue(framesAtom)

  if (Result.isInitial(result)) return <Skeleton />         // loading
  if (Result.isFailure(result)) return <ErrorPanel />        // error
  return <FrameGrid frames={result.value} />                 // success
}
```

### DO: effect-machine for complex multi-step transitions

When a workflow has 4+ states, guarded transitions, or state-scoped effects,
use effect-machine instead of manually tracking progress in an atom.

```tsx
import { Machine, State, Event } from "effect-machine"

// 1. Schema-first state and event definitions
const ImportState = State({
  Idle: {},
  Reading: { fileCount: Schema.Number },
  Hashing: { fileCount: Schema.Number },
  Storing: { progress: Schema.Number, total: Schema.Number },
  Done: { frameIds: Schema.Array(Schema.String) },
  Failed: { error: Schema.String, retryable: Schema.Boolean },
})

const ImportEvent = Event({
  Start: { files: Schema.Array(Schema.instanceOf(File)) },
  ReadComplete: { fileCount: Schema.Number },
  HashComplete: {},
  StoreProgress: { progress: Schema.Number, total: Schema.Number },
  Complete: { frameIds: Schema.Array(Schema.String) },
  Fail: { error: Schema.String, retryable: Schema.Boolean },
  Retry: {},
})

// 2. Machine with compile-time enforced transitions
const importMachine = Machine.make({
  state: ImportState,
  event: ImportEvent,
  initial: ImportState.Idle,
})
  .on(ImportState.Idle, ImportEvent.Start, () => ImportState.Reading({ fileCount: 0 }))
  .on(ImportState.Reading, ImportEvent.HashComplete, ({ state }) =>
    ImportState.Hashing.derive(state),
  )
  .on(ImportState.Hashing, ImportEvent.StoreProgress, ({ event }) =>
    ImportState.Storing({ progress: event.progress, total: event.total }),
  )
  .on(ImportState.Storing, ImportEvent.Complete, ({ event }) =>
    ImportState.Done({ frameIds: event.frameIds }),
  )
  // Any state can fail
  .onAny(ImportEvent.Fail, ({ event }) =>
    ImportState.Failed({ error: event.error, retryable: event.retryable }),
  )
  // Retry from failed goes back to Idle
  .on(ImportState.Failed, ImportEvent.Retry, () => ImportState.Idle)
  // State-scoped effect: runs only while in Reading, auto-cancelled on exit
  .spawn(ImportState.Reading, ({ self }) =>
    Effect.gen(function* () {
      // Actual file reading work happens here
      // If state exits (e.g., user cancels), this fiber is interrupted
    }),
  )
  .final(ImportState.Done)
  .build()
```

### DO: Simple multi-step with Atom.fn (when you don't need a full machine)

```tsx
// For simpler cases, use Atom.fn with a progress atom
const importProgressAtom = Atom.make<ImportState>({ _tag: "idle" })

const importFramesAtom = runtimeAtom.fn(
  Effect.fnUntraced(function* (files: File[], get: Atom.FnContext) {
    get.set(importProgressAtom, { _tag: "reading", fileCount: files.length })
    const blobs = yield* readFiles(files)
    get.set(importProgressAtom, { _tag: "hashing" })
    const hashes = yield* hashBlobs(blobs)
    get.set(importProgressAtom, { _tag: "done", frameIds: hashes })
    return hashes
  }),
)
```

### DON'T

```tsx
// Boolean soup — impossible to know the real state
const [loading, setLoading] = useState(false)
const [error, setError] = useState(null)
const [data, setData] = useState(null)
// What does loading=false, error=null, data=null mean?
// Is it idle? Did something silently fail?
```

---

## 4. Error Classification

Not all errors are equal. Classify them before choosing a UI strategy.

### Error Types

| Type              | Cause                         | User Can Fix? | UI Strategy                         |
|-------------------|-------------------------------|---------------|-------------------------------------|
| **Network**       | Offline, timeout, DNS         | Sometimes     | Retry button + offline indicator    |
| **Auth**          | Token expired, unauthorized   | Yes           | Redirect to login                   |
| **Validation**    | Bad input from user           | Yes           | Inline field errors                 |
| **Data Integrity**| NaN, null, negative count     | No            | Fallback display + background alert |
| **Partial Outage**| 1 of N services down          | No            | Degrade gracefully, hide broken part|
| **Fatal**         | Unrecoverable crash           | No            | Error boundary with reset option    |

### Decision Tree: How to Handle an Error

```
Is the error caused by user input?
├── YES → Show inline validation. Don't clear the form.
└── NO
    └── Is the error transient (network, timeout)?
        ├── YES → Show retry button. Preserve user's work.
        └── NO
            └── Does the error affect the whole page?
                ├── YES → Error boundary. Offer "Go Home" or "Retry".
                └── NO → Hide/dim the broken component. Keep the rest alive.
```

---

## 5. The Sanity Check Pattern

Before rendering data, ask: "Does this value make sense?"

If a count is negative, if a percentage exceeds 100, if a date is in the year
1970 — the data is corrupt. Don't render it. Show a fallback.

### DO

```tsx
function renderCount(count: number): string {
  if (!Number.isFinite(count) || count < 0) {
    return "Updating..."
  }
  return count.toLocaleString()
}
```

### DON'T

```tsx
// Renders "NaN" or "-42" directly to the user
function renderCount(count: number): string {
  return count.toLocaleString()
}
```

### Sanity Check Rules

| Data Type   | Suspect When               | Fallback Text         |
|-------------|----------------------------|-----------------------|
| Count       | `< 0` or `NaN`            | "Updating..."         |
| Percentage  | `< 0` or `> 100`          | "--"                  |
| Date        | Before 2000 or after 2100  | "Date unavailable"    |
| String      | Empty or only whitespace   | "Untitled" / "--"     |
| Array       | `null` instead of `[]`     | Empty state UI        |
| Currency    | `NaN` or negative balance  | "Calculating..."      |

---

## 6. Graceful Degradation

When part of the system fails, the rest must survive. A single broken widget
should never take down the entire page.

### The Blast Radius Rule

```
Can the broken thing be isolated?
├── YES → Wrap it in an error boundary. Replace with placeholder.
└── NO
    └── Is the broken thing the primary content?
        ├── YES → Full-page error with recovery options.
        └── NO → Hide it. Show the rest. Log the failure.
```

### DO

```tsx
// Each independent section gets its own error boundary
<Layout>
  <ErrorBoundary fallback={<AnalyticsUnavailable />}>
    <AnalyticsDashboard />
  </ErrorBoundary>
  <ErrorBoundary fallback={<TimelineUnavailable />}>
    <Timeline />
  </ErrorBoundary>
  <FrameCanvas /> {/* Primary content — no boundary here, handled at page level */}
</Layout>
```

### DON'T

```tsx
// One error boundary for the entire app — everything dies together
<ErrorBoundary fallback={<WhiteScreenOfDeath />}>
  <EntireApp />
</ErrorBoundary>
```

---

## 7. Loading States

Loading is not a boolean. It is a spectrum from "instant" to "will this ever
finish?" In effect-atom, `Result.waiting` is the unified loading signal.

### Loading Duration Strategy

| Duration      | Strategy                                   |
|---------------|--------------------------------------------|
| < 100ms       | No indicator. Feels instant.               |
| 100ms - 1s    | Subtle indicator (progress bar, opacity).   |
| 1s - 5s       | Skeleton screen or shimmer.                |
| 5s - 30s      | Progress bar with percentage or step label. |
| > 30s         | Background task with notification on done.  |

### Decision Tree: What Loading UI?

```
How long will this take?
├── < 100ms → Nothing. Don't flash a spinner.
├── < 1s → Delay the spinner by 200ms. If done before 200ms, skip it.
├── < 5s → Skeleton screen matching the layout of the final content.
├── < 30s → Progress indicator with cancel option.
└── > 30s → Move to background. "We'll notify you when it's ready."
```

### DO: Use Result.waiting for stale-while-revalidate

```tsx
// effect-atom gives you stale data + waiting flag for free
function UserList() {
  const result = useAtomValue(usersAtom)

  if (Result.isInitial(result)) return <Skeleton />  // first load

  if (Result.isSuccess(result)) {
    return (
      <div>
        {result.waiting && <RefreshBar />}  {/* refetching — show stale data + indicator */}
        <List items={result.value} />
      </div>
    )
  }

  return <ErrorPanel cause={result.cause} />
}
```

### DO: Use initialValue to skip the empty Initial state

```tsx
// With initialValue, the atom starts as Success([]) instead of Initial
const usersAtom = runtimeAtom.atom(
  Effect.gen(function* () {
    const users = yield* Users
    return yield* users.getAll
  }),
  { initialValue: [] },
)
// Result.isSuccess from the start — no skeleton flash for empty lists
```

### DON'T

```tsx
// Spinner appears for 50ms then vanishes — feels broken
{loading && <Spinner />}

// Also DON'T: ignore the waiting flag on Success
if (Result.isSuccess(result)) return <List items={result.value} />
// User has no idea a refetch is happening in the background
```

---

## 8. Empty States

An empty state is not an error. It is an opportunity to guide the user.

### Decision Tree: What Kind of Empty?

```
Why is there no data?
├── User hasn't created anything yet → "Get started" CTA
├── Search/filter returned nothing → "No results. Try different filters."
├── Data was deleted → Confirmation + undo option
└── Data hasn't loaded yet → This is LOADING, not EMPTY. Show skeleton.
```

### DO

```tsx
function EmptyFrameList() {
  return (
    <div>
      <p>No frames imported yet.</p>
      <p>Drag and drop images here, or click Import.</p>
    </div>
  )
}
```

### DON'T

```tsx
// Empty div. User thinks the page is broken.
function EmptyFrameList() {
  return <div></div>
}
```

---

## 9. Optimistic Updates

Show the result before the server confirms it. Roll back if it fails.

effect-atom has first-class optimistic update support via `Atom.optimistic`
and `Atom.optimisticFn`. The flow:
1. `reducer` computes the optimistic value instantly
2. UI shows the optimistic value while the mutation runs
3. On success: source atom refetches real data from server
4. On failure: reverts to last known value automatically

### When to Use Optimistic Updates

```
Is the action likely to succeed (>95%)?
├── YES
│   └── Is the action reversible?
│       ├── YES → Atom.optimisticFn. Auto-rollback on failure.
│       └── NO → runtimeAtom.fn. Show progress, wait for confirmation.
└── NO → runtimeAtom.fn. Show progress, wait for confirmation.
```

### DO: Use Atom.optimisticFn for instant UI feedback

```tsx
// Source: the "real" data
const todosAtom = runtimeAtom.atom(fetchTodos)

// Wrap for optimistic updates
const optimisticTodos = Atom.optimistic(todosAtom)

// Delete with instant UI update + automatic rollback on failure
const deleteTodoFn = Atom.optimisticFn(optimisticTodos, {
  // Immediately show filtered list
  reducer: (todos, id: string) => todos.filter((t) => t.id !== id),
  // The actual server call
  fn: runtimeAtom.fn(
    Effect.fnUntraced(function* (id: string) {
      yield* TodoService.delete(id)
    }),
  ),
})

// In React:
const deleteTodo = useAtomSet(deleteTodoFn)
deleteTodo("todo-123") // UI updates instantly, server call runs in background
```

### DO: Use runtimeAtom.fn with reactivityKeys for non-optimistic mutations

```tsx
// Mutation auto-refreshes the query atom via reactivity keys
const createTodoAtom = runtimeAtom.fn(
  Effect.fnUntraced(function* (name: string) {
    const todos = yield* Todos
    return yield* todos.create(name)
  }),
  { reactivityKeys: ["todos"] },
)

// Query listens for the same key
const todosAtom = runtimeAtom.atom(
  Effect.gen(function* () {
    const todos = yield* Todos
    return yield* todos.getAll
  }),
).pipe(Atom.withReactivity(["todos"]))
// After createTodoAtom completes, todosAtom auto-refetches
```

### DON'T

```tsx
// User drags 20 images. Nothing happens for 5 seconds. They try again.
async function onDrop(files: File[]) {
  const result = await importAllFiles(files)  // blocks UI
  setFrames(result)
}

// Also DON'T: manually manage optimistic state with useState
// effect-atom handles rollback, refetch, and race conditions for you
```

---

## 10. Offline & Sync States

For apps using local-first architecture (Yjs, CRDTs, IndexedDB), sync state
is a permanent concern.

### Sync State Machine

This is an ideal use case for effect-machine — multiple named states with
state-scoped effects (polling only while syncing, retries only while offline).

```tsx
import { Machine, State, Event, Slot } from "effect-machine"

const SyncState = State({
  Synced: {},
  Offline: { queuedChanges: Schema.Number },
  Syncing: { progress: Schema.Number },
  Conflict: { localVersion: Schema.Number, remoteVersion: Schema.Number },
})

const SyncEvent = Event({
  Disconnect: {},
  Reconnect: {},
  SyncComplete: {},
  SyncFail: {},
  ConflictDetected: { localVersion: Schema.Number, remoteVersion: Schema.Number },
  ResolveConflict: { resolution: Schema.Literal("mine", "theirs", "merge") },
  QueueChange: {},
})

const syncMachine = Machine.make({
  state: SyncState,
  event: SyncEvent,
  initial: SyncState.Synced,
})
  .onAny(SyncEvent.Disconnect, () => SyncState.Offline({ queuedChanges: 0 }))
  .on(SyncState.Offline, SyncEvent.QueueChange, ({ state }) =>
    SyncState.Offline({ queuedChanges: state.queuedChanges + 1 }),
  )
  .on(SyncState.Offline, SyncEvent.Reconnect, () => SyncState.Syncing({ progress: 0 }))
  .on(SyncState.Syncing, SyncEvent.SyncComplete, () => SyncState.Synced)
  .on(SyncState.Syncing, SyncEvent.ConflictDetected, ({ event }) =>
    SyncState.Conflict({ localVersion: event.localVersion, remoteVersion: event.remoteVersion }),
  )
  .on(SyncState.Conflict, SyncEvent.ResolveConflict, () => SyncState.Syncing({ progress: 0 }))
  // State-scoped: retry sync only while in Syncing state, auto-cancelled on exit
  .spawn(SyncState.Syncing, ({ self }) =>
    Effect.gen(function* () {
      yield* pushChangesToServer
      yield* self.send(SyncEvent.SyncComplete)
    }).pipe(Effect.retry(Schedule.exponential("1 second"))),
  )
  .build()
```

### Sync UI Requirements

| State        | UI Indicator                                  |
|--------------|-----------------------------------------------|
| **Synced**   | Green dot or nothing. Don't over-communicate. |
| **Offline**  | Yellow banner: "Offline — changes saved locally." |
| **Syncing**  | Subtle spinner near the sync indicator.       |
| **Conflict** | Inline diff with "Keep mine / Keep theirs / Merge." |
| **Stale**    | "Data synced 2 min ago" + manual refresh.     |

### DO: Bridge online/offline status with effect-atom

```tsx
// Event listener atom — persists even when no components subscribe
const onlineAtom = Atom.make((get) => {
  const update = () => get.setSelf(navigator.onLine)
  window.addEventListener("online", update)
  window.addEventListener("offline", update)
  get.addFinalizer(() => {
    window.removeEventListener("online", update)
    window.removeEventListener("offline", update)
  })
  return navigator.onLine
}).pipe(Atom.keepAlive)

// Auto-refresh data when coming back online
const refreshOnOnline = Atom.makeRefreshOnSignal(onlineAtom)
const dataAtom = runtimeAtom.atom(fetchData).pipe(refreshOnOnline)

// In React:
function OfflineBanner() {
  const isOnline = useAtomValue(onlineAtom)
  if (isOnline) return null
  return <Banner>You're offline — changes saved locally.</Banner>
}
```

### DON'T

```tsx
// No sync indicator. User has no idea if their work is saved.
// They close the tab. Data is lost.
```

---

## 11. Data Freshness

When data comes from a cache or was last fetched N minutes ago, say so.
effect-atom provides built-in tools for cache TTL and auto-refresh.

### Freshness Rules

| Age of Data  | Action                                         |
|--------------|------------------------------------------------|
| < 30s        | Show as-is. No indicator needed.               |
| 30s - 5min   | Show timestamp: "Updated 2 min ago."           |
| 5min - 1hr   | Show timestamp + auto-refresh or refresh CTA.  |
| > 1hr        | Stale warning. Block actions until refreshed.  |

### DO: Use effect-atom combinators for freshness

```tsx
// Cache survives unmount for 5 minutes, auto-refetches on tab focus
const dashboardAtom = runtimeAtom.atom(
  Effect.gen(function* () {
    const api = yield* DashboardApi
    return yield* api.fetchStats()
  }),
).pipe(
  Atom.setIdleTTL("5 minutes"),       // cache persists after unmount
  Atom.refreshOnWindowFocus,           // refetch when user returns to tab
  Atom.withReactivity(["dashboard"]),  // refetch after mutations
)

// Use Result.timestamp to show freshness
function FreshnessIndicator({ result }: { result: Result.Result<unknown> }) {
  if (!Result.isSuccess(result)) return null
  return (
    <span className={css({ color: "gray.500", fontSize: "xs" })}>
      Last updated {formatRelativeTime(result.timestamp)}
    </span>
  )
}
```

### DO: Use withFallback to show cached data while fresh data loads

```tsx
const cachedAtom = runtimeAtom.atom(fetchCachedData).pipe(Atom.keepAlive)
const liveAtom = runtimeAtom.atom(fetchLiveData)
const dataAtom = Atom.withFallback(liveAtom, cachedAtom)
// Shows cached data while live data loads, switches when live resolves
```

### DON'T

```tsx
// User sees data from 3 hours ago and thinks it's current.
// They make decisions based on stale numbers.

// Also DON'T: let atoms auto-dispose immediately on unmount for expensive fetches
// Use Atom.setIdleTTL to keep the cache warm during navigation
```

---

## 12. Microcopy: What to Say When Things Break

The words matter as much as the UI.

### Microcopy Rules

| Situation               | DO Say                                      | DON'T Say                    |
|-------------------------|---------------------------------------------|------------------------------|
| Network error           | "Can't connect. Check your connection."     | "Error: ECONNREFUSED"       |
| Server error            | "Something went wrong. Try again."          | "500 Internal Server Error"  |
| Empty search            | "No results for 'xyz'. Try different terms."| "No data"                    |
| Long operation          | "Importing 24 frames... (12 of 24)"        | "Loading..."                 |
| Permission denied       | "You don't have access. Contact an admin."  | "403 Forbidden"              |
| Timeout                 | "This is taking longer than usual. Retry?"  | "Request timed out"          |
| Data inconsistency      | "Updating..."                               | "NaN" / "-1" / "null"       |
| Offline                 | "You're offline. Changes saved locally."    | (nothing)                    |

### Principles

1. **Never show raw error codes to users.** Parse them. Translate them.
2. **Always offer a next step.** "Try again," "Go back," "Contact support."
3. **Be specific about what failed.** "Couldn't save frame 3" > "Save failed."
4. **Don't blame the user.** "We couldn't load this" > "You lost connection."
5. **Use the active voice.** "Can't connect" > "Connection was not established."

---

## 13. State Machine Implementation Patterns

### Pattern 1: effect-atom Result (Default for all async data)

```tsx
// The atom IS the state machine. Result handles idle/loading/success/error.
const usersAtom = runtimeAtom.atom(
  Effect.gen(function* () {
    const users = yield* Users
    return yield* users.getAll
  }),
)
// Type: Atom<Result<User[]>>
// Result.Initial → idle/loading
// Result.Success → data ready (check .waiting for refetch)
// Result.Failure → error occurred
```

**Why:** No manual state management. The runtime tracks the effect lifecycle.
The `waiting` flag handles stale-while-revalidate for free.

### Pattern 2: Tagged Errors for Classified Failures

```tsx
import * as Data from "effect/Data"

class NetworkError extends Data.TaggedError("NetworkError")<{
  message: string
  retryable: boolean
}> {}

class ValidationError extends Data.TaggedError("ValidationError")<{
  field: string
  message: string
}> {}

// The type signature documents every possible failure
const importFrame = (file: File): Effect.Effect<
  Frame,
  NetworkError | ValidationError,
  BlobStore
> => // ...

// In the UI, match on the error tag inside Result.Failure:
function handleFailure(result: Result.Result<Frame, NetworkError | ValidationError>) {
  if (!Result.isFailure(result)) return null
  const error = Cause.failureOption(result.cause)
  if (Option.isNone(error)) return <p>Unknown error</p>
  switch (error.value._tag) {
    case "NetworkError":
      return error.value.retryable
        ? <RetryButton />
        : <p>Can't connect. Check your network.</p>
    case "ValidationError":
      return <FieldError field={error.value.field} message={error.value.message} />
  }
}
```

### Pattern 3: Atom.fn for Mutation State Tracking

```tsx
// Mutation atom — tracks its own Result lifecycle
const createUserAtom = runtimeAtom.fn(
  Effect.fnUntraced(function* (name: string) {
    const users = yield* Users
    return yield* users.create(name)
  }),
  { reactivityKeys: ["users"] },
)

// In React:
function CreateUserButton() {
  const result = useAtomValue(createUserAtom)
  const createUser = useAtomSet(createUserAtom)

  return (
    <>
      <button
        onClick={() => createUser("Alice")}
        disabled={Result.isWaiting(result)}  // prevent double-submit
      >
        {Result.isWaiting(result) ? "Creating..." : "Create User"}
      </button>
      {Result.isFailure(result) && <ErrorPanel cause={result.cause} />}
    </>
  )
}
```

### Pattern 4: Dependent Atoms (auto-refetch on dependency change)

```tsx
// When selectedIdAtom changes, userAtom automatically refetches
const selectedIdAtom = Atom.make<string | null>(null)

const userAtom = runtimeAtom.atom(
  Effect.fnUntraced(function* (get: Atom.Context) {
    const id = yield* get.result(selectedIdAtom)  // tracked dependency
    const users = yield* Users
    return yield* users.findById(id)
  }),
)
// Previous fetch is interrupted when selectedIdAtom changes
```

### Pattern 5: effect-machine for Complex UI Workflows

Use effect-machine when the component has 4+ states, guarded transitions,
state-scoped effects (polling, timers), or needs persistence.

```tsx
import { Machine, State, Event, Slot } from "effect-machine"

// Schema-first — states and events are schemas, enabling persistence & serialization
const FormState = State({
  Editing: { dirty: Schema.Boolean },
  Validating: {},
  Submitting: {},
  Success: { id: Schema.String },
  Error: { message: Schema.String, retryable: Schema.Boolean },
})

const FormEvent = Event({
  Submit: {},
  ValidationPass: {},
  ValidationFail: { message: Schema.String },
  SubmitSuccess: { id: Schema.String },
  SubmitFail: { message: Schema.String, retryable: Schema.Boolean },
  Retry: {},
  Reset: {},
})

const FormEffects = Slot.Effects({
  validate: {},
  submit: {},
})

const formMachine = Machine.make({
  state: FormState,
  event: FormEvent,
  effects: FormEffects,
  initial: FormState.Editing({ dirty: false }),
})
  .on(FormState.Editing, FormEvent.Submit, () => FormState.Validating)
  .on(FormState.Validating, FormEvent.ValidationPass, () => FormState.Submitting)
  .on(FormState.Validating, FormEvent.ValidationFail, ({ event }) =>
    FormState.Error({ message: event.message, retryable: true }),
  )
  .on(FormState.Submitting, FormEvent.SubmitSuccess, ({ event }) =>
    FormState.Success({ id: event.id }),
  )
  .on(FormState.Submitting, FormEvent.SubmitFail, ({ event }) =>
    FormState.Error({ message: event.message, retryable: event.retryable }),
  )
  .on(FormState.Error, FormEvent.Retry, () => FormState.Editing({ dirty: true }))
  .onAny(FormEvent.Reset, () => FormState.Editing({ dirty: false }))
  // State-scoped: validation runs only in Validating, auto-cancelled if user navigates away
  .spawn(FormState.Validating, ({ effects, self }) =>
    Effect.gen(function* () {
      yield* effects.validate({})
      yield* self.send(FormEvent.ValidationPass)
    }),
  )
  // State-scoped: submission runs only in Submitting
  .spawn(FormState.Submitting, ({ effects, self }) =>
    Effect.gen(function* () {
      const result = yield* effects.submit({})
      yield* self.send(FormEvent.SubmitSuccess({ id: result.id }))
    }),
  )
  .final(FormState.Success)
  .build({
    validate: (_, { self }) => validateFormData(self),
    submit: (_, { self }) => submitFormData(self),
  })
```

**Rendering an effect-machine actor state with `$match`:**

```tsx
function FormStatus({ actor }: { actor: ActorRef }) {
  const state = useActorState(actor)  // subscribe to state changes

  return state.$match({
    Editing: ({ dirty }) => dirty ? <Badge>Unsaved changes</Badge> : null,
    Validating: () => <Spinner label="Validating..." />,
    Submitting: () => <Spinner label="Submitting..." />,
    Success: ({ id }) => <SuccessBanner>Saved as {id}</SuccessBanner>,
    Error: ({ message, retryable }) => (
      <ErrorPanel message={message}>
        {retryable && <button onClick={() => actor.sendSync(FormEvent.Retry)}>Retry</button>}
      </ErrorPanel>
    ),
  })
}
```

### Pattern 6: Exhaustive Render with Manual Discriminated Union

When you don't need effect-machine's full power but Result isn't granular enough:

```tsx
type ImportState =
  | { _tag: "idle" }
  | { _tag: "reading"; fileCount: number }
  | { _tag: "hashing" }
  | { _tag: "done"; frameIds: string[] }
  | { _tag: "failed"; error: string; retryable: boolean }

function FrameImporter({ state }: { state: ImportState }) {
  switch (state._tag) {
    case "idle":     return <DropZone />
    case "reading":  return <Progress label={`Reading ${state.fileCount} files...`} />
    case "hashing":  return <Progress label="Processing..." />
    case "done":     return <FrameGrid frameIds={state.frameIds} />
    case "failed":   return <ErrorPanel message={state.error} canRetry={state.retryable} />
  }
}
```

---

## 14. Error Boundaries: Placement Strategy

### Decision Tree: Where to Place Error Boundaries

```
Is this component independent from its siblings?
├── YES → Wrap it in its own error boundary.
└── NO
    └── If this component crashes, can the parent still function?
        ├── YES → Wrap it.
        └── NO → Let the error propagate to the parent's boundary.
```

### Boundary Hierarchy (Outermost to Innermost)

1. **App-level:** Catches truly unrecoverable errors. Shows "reload app" page.
2. **Route-level:** Catches route-specific crashes. Offers "go back" navigation.
3. **Section-level:** Isolates dashboard panels, sidebars, modals.
4. **Widget-level:** Isolates individual data displays that can fail independently.

### Rule of Thumb

If you can describe the component as "[noun] that fetches its own data," it
needs its own error boundary.

---

## 15. Recovery Patterns

When something fails, the user needs a path forward.

### Recovery Decision Tree

```
What type of failure?
├── Transient (network, timeout)
│   └── Offer: "Retry" button that replays the exact same request.
├── Auth (expired session)
│   └── Offer: Redirect to login. Preserve current URL for redirect-back.
├── Data (corrupt, missing, inconsistent)
│   └── Offer: "Refresh" to re-fetch. Or fallback to cached version.
├── User error (bad input)
│   └── Offer: Inline errors. Don't clear the form. Highlight the field.
└── Fatal (unrecoverable)
    └── Offer: "Reload page" or "Go to home." Log the error.
```

### DO: Use useAtomRefresh for retry

```tsx
function UsersPanel() {
  const result = useAtomValue(usersAtom)
  const refresh = useAtomRefresh(usersAtom)  // works on any atom (read-only or writable)

  if (Result.isFailure(result)) {
    return (
      <div>
        <p>{getUserMessage(result.cause)}</p>
        <button onClick={() => refresh()}>Try Again</button>
      </div>
    )
  }
  // ...
}
```

### DO: Use Atom.fn with Reset for mutation recovery

```tsx
function CreateForm() {
  const result = useAtomValue(createUserAtom)
  const createUser = useAtomSet(createUserAtom)

  if (Result.isFailure(result)) {
    return (
      <div>
        <p>Failed to create user.</p>
        <button onClick={() => createUser(Atom.Reset)}>Dismiss</button>
        <button onClick={() => createUser(lastInput)}>Retry</button>
      </div>
    )
  }
  // ...
}
```

### DON'T

```tsx
// Dead end. User can only reload the entire page.
function ErrorPanel({ error }: { error: string }) {
  return <p style={{ color: "red" }}>{error}</p>
}

// DON'T use useAtomSet on a read-only runtimeAtom.atom() — it's a type error
// Use useAtomRefresh instead
const refresh = useAtomSet(usersAtom)  // ❌ usersAtom is Atom, not Writable
```

---

## 16. Preserving User Work

The worst error handling is the kind that destroys what the user was doing.

### Rules

1. **Never clear a form on submission failure.** The user typed that data.
2. **Never navigate away on error.** Keep the user where they were.
3. **Auto-save drafts.** If the page crashes, the work should survive.
4. **Confirm destructive actions.** "Delete 24 frames?" with undo.
5. **Keep local state during reconnection.** Offline edits merge when back online.

### DO: Use Atom.kvs for persistent drafts

```tsx
import { BrowserKeyValueStore } from "@effect/platform-browser"

const storageRuntime = Atom.runtime(BrowserKeyValueStore.layerLocalStorage)

// Draft auto-persists to localStorage with schema validation
const draftAtom = Atom.kvs({
  runtime: storageRuntime,
  key: "project-draft",
  schema: Schema.Struct({
    name: Schema.String,
    description: Schema.String,
  }),
  defaultValue: () => ({ name: "", description: "" }),
})
// Reads from localStorage on mount, writes back on every set
// Survives page crashes, tab closes, and refreshes
```

### DO: Use keepAlive to preserve state across navigation

```tsx
// Without keepAlive: user navigates away, comes back, state is gone
// With keepAlive: state survives as long as the app is open
const editorStateAtom = Atom.make(initialEditorState).pipe(Atom.keepAlive)
```

### DON'T

```tsx
// Form submission fails. Form is cleared. User screams.
const onSubmit = async () => {
  try {
    await save(formState)
    setFormState(initialState)  // Clears even if nothing was saved
  } catch {
    setFormState(initialState)  // WHY?
  }
}

// DON'T: Use raw localStorage manually — Atom.kvs gives you schema validation,
// automatic serialization, and reactive updates for free
```

---

## 17. Progress Communication

For operations that take more than 1 second, tell the user what's happening.

### Progress Levels

| Level            | When to Use                       | Example                              |
|------------------|-----------------------------------|--------------------------------------|
| **Indeterminate**| Unknown duration, < 5s expected   | Spinner                              |
| **Determinate**  | Known total, > 2s                 | "12 of 24 frames imported"           |
| **Stepped**      | Multi-phase operation             | "Step 2 of 3: Processing images..."  |
| **Background**   | > 30s, user can do other things   | Toast: "Import complete!" when done  |

### DO

```tsx
<ProgressBar
  value={imported}
  max={total}
  label={`Importing frame ${imported} of ${total}...`}
/>
```

### DON'T

```tsx
// "Loading..." for 45 seconds. User has no idea what's happening.
{loading && <p>Loading...</p>}
```

---

## 18. Quick Reference: Checklists

### Before Shipping Any Component

- [ ] `Result.isInitial` renders a meaningful empty state or skeleton
- [ ] `Result.isFailure` shows a human-readable message + recovery action
- [ ] `Result.isSuccess` with `waiting: true` shows a subtle refresh indicator
- [ ] Data values are sanity-checked before rendering (NaN, null, negative)
- [ ] Error boundaries isolate this component from siblings
- [ ] User's in-progress work survives errors
- [ ] Long operations show progress, not just "Loading..."
- [ ] Atoms use `initialValue` where appropriate to skip Initial flash

### Before Shipping Any Form

- [ ] Validation errors appear inline next to the field
- [ ] Form is NOT cleared on submission failure
- [ ] Submit button disabled while `Result.isWaiting` (prevent double-submit)
- [ ] Success state is confirmed to the user (toast, redirect, or inline)
- [ ] Drafts auto-saved via `Atom.kvs` or `Atom.keepAlive`

### Before Shipping Any Async Flow

- [ ] Async data uses `runtimeAtom.atom` (not manual state management)
- [ ] Mutations use `runtimeAtom.fn` with `reactivityKeys` to auto-refresh queries
- [ ] Expensive fetches use `Atom.setIdleTTL` to cache across navigation
- [ ] Shared state uses `Atom.keepAlive` to survive route changes
- [ ] Dependent atoms use `get.result()` (not `get()`) inside Effect bodies
- [ ] `Atom.mapResult` used (not `Atom.map`) when deriving from Result atoms
- [ ] Cancellation works: re-triggering a fn atom interrupts the previous call
- [ ] Offline behavior is defined (queue, block, or warn)

### Before Shipping Any effect-machine Workflow

- [ ] All states have a UI (use `$match` — compiler catches missing states)
- [ ] Error states offer recovery (retry transition back to a safe state)
- [ ] State-scoped effects use `.spawn()` (auto-cancelled on state exit)
- [ ] Long-running work is in `.spawn()`, not `.on()` (transitions must be fast)
- [ ] Final states are marked with `.final()` (actor cleans up)
- [ ] `.onAny()` handles unexpected events gracefully (e.g., Cancel from any state)
- [ ] Guards use `Slot.Guards` + `.build()` (not inline service access in handlers)
- [ ] Empty state variants use `State.X` (not `State.X()` — no parentheses)

---

## 19. Anti-Patterns Summary

### General Anti-Patterns

| Anti-Pattern                        | Why It's Bad                                 | Fix                                    |
|-------------------------------------|----------------------------------------------|----------------------------------------|
| Boolean `loading`/`error` flags     | Can't represent partial or compound states   | Use `Result<A, E>` or discriminated union |
| `catch (e) { console.log(e) }`     | Error is swallowed, user sees nothing        | Show error UI, log to monitoring       |
| Raw error codes in UI               | "ECONNREFUSED" means nothing to users        | Map errors to human-readable messages  |
| Single error boundary at app root   | One widget crash kills everything            | Boundary per independent section       |
| No empty state                      | Blank screen looks broken                    | Design a purposeful empty state        |
| Spinner for 50ms                    | Flickering feels janky                       | Delay spinner by 200ms or use `initialValue` |
| "Loading..." for 30 seconds         | User abandons the task                       | Show progress with percentage/steps    |
| Clearing form on error              | Destroys user's work                         | Keep form state, use `Atom.kvs` for drafts |
| Navigating away on error            | User loses context                           | Show error in-place                    |
| Rendering `NaN`, `null`, `-1`       | User loses trust in the product              | Sanity check, show "Updating..."       |
| No offline indicator                | User doesn't know their edits aren't syncing | Show sync status via `onlineAtom`      |
| Alert box for recoverable errors    | Jarring, breaks flow                         | Inline error with `useAtomRefresh`     |

### effect-atom Specific Anti-Patterns

| Anti-Pattern                                    | Why It's Bad                                       | Fix                                              |
|-------------------------------------------------|----------------------------------------------------|--------------------------------------------------|
| `get(atom)` inside Effect body                  | Returns `Result<A>`, not `A` — causes runtime crash | Use `yield* get.result(atom)`                    |
| `Atom.map(resultAtom, fn)`                      | `fn` receives `Result<A>`, not `A`                 | Use `Atom.mapResult(resultAtom, fn)`             |
| Creating atoms inside components                | New atom every render — infinite loop               | Use module scope or `Atom.family`                |
| `useAtomSet` on a read-only `runtimeAtom.atom`  | Type error — `Atom` is not `Writable`              | Use `useAtomRefresh` to re-trigger               |
| No `initialValue` on data atoms                 | Flash of empty `Initial` state on mount            | Add `{ initialValue: [] }` for list atoms        |
| Missing `Atom.keepAlive` on shared state        | State resets when navigating between routes         | Add `.pipe(Atom.keepAlive)` for persistent state |
| Missing `Atom.setIdleTTL` on expensive fetches  | Re-fetches on every mount after navigation          | Add `.pipe(Atom.setIdleTTL("5 minutes"))`        |
| Ignoring `Result.waiting` on `Success`          | User doesn't know a refetch is happening            | Show subtle refresh indicator                    |
| `Runtime.runPromise` escape hatch without refresh | Reactivity keys don't fire — query atoms go stale | Manually call `registry.refresh(queryAtom)` after |

### effect-machine Specific Anti-Patterns

| Anti-Pattern                                    | Why It's Bad                                       | Fix                                              |
|-------------------------------------------------|----------------------------------------------------|--------------------------------------------------|
| Long-running work in `.on()` handler            | Blocks the transition — UI freezes                 | Move to `.spawn()` (forked, state-scoped)        |
| `State.Idle()` with parentheses                 | Runtime error — empty structs are values, not constructors | Use `State.Idle` (no parens)              |
| `throw` inside `Effect.gen`                     | Bypasses Effect error channel — untyped crash      | Use `yield* Effect.fail(new MyError())`          |
| Missing `yield* Effect.yieldNow()` after `send` | Effects don't run — event is queued but not processed | Add `yield* Effect.yieldNow()` after `actor.send` |
| Forgetting `.final()` on terminal states        | Actor never cleans up — fiber leak                 | Mark done/cancelled/error states as `.final()`   |
| `self.spawn` without `Effect.orDie`             | Handler requires error channel `never`, spawn can fail | Wrap: `self.spawn(id, m).pipe(Effect.orDie)`  |
| Services in `.on()` handler                     | `.on()` requires `R = never` — compile error       | Use `Slot.Effects` + `.build()` for service access |
| Same-state transition expecting spawn re-run    | Same-state skips `.spawn()` lifecycle by default   | Use `.reenter()` to force re-entry               |
| Missing `$match` for UI rendering               | Manual switch can miss new states silently          | Use `state.$match({...})` — exhaustive at compile time |

---

## 20. Decision Tree: Master Flow

When building any new feature or component, walk through this:

```
1. CHOOSE the right tool.
   └── Simple fetch/mutate lifecycle (3 states)?
       → effect-atom: runtimeAtom.atom() / runtimeAtom.fn()
   └── Complex workflow (4+ named states, guards, state-scoped effects)?
       → effect-machine: Machine.make() with .on(), .spawn(), .build()
   └── Parameterized instances?
       → effect-atom: Atom.family()  /  effect-machine: spawn per ID
   └── Persistent state?
       → effect-atom: Atom.kvs()  /  effect-machine: .persist()

2. HANDLE all states in the UI.
   effect-atom Result:
   └── Result.isInitial (waiting: false) → Empty state / CTA
   └── Result.isInitial (waiting: true)  → Skeleton / shimmer
   └── Result.isSuccess (waiting: false) → Render data
   └── Result.isSuccess (waiting: true)  → Render data + refresh indicator
   └── Result.isFailure                  → Error message + recovery action
   effect-machine:
   └── Use state.$match({...}) — compiler catches missing states
   └── Every state variant MUST have a UI (idle, loading, error, success, partial)
   └── State-scoped effects (.spawn) must have visible feedback

3. CLASSIFY each error type and offer recovery.
   └── Transient → useAtomRefresh / actor.send(RetryEvent)
   └── Auth → Redirect to login
   └── Data → Sanity check before rendering, show fallback
   └── User input → Inline field errors
   └── Fatal → Error boundary with reset
   └── Machine error state → transition back to safe state via Retry event

4. CONFIGURE lifecycle.
   effect-atom:
   └── Expensive fetch? → Atom.setIdleTTL("5 minutes")
   └── Shared state? → Atom.keepAlive
   └── Tab switching? → Atom.refreshOnWindowFocus
   └── After mutations? → Atom.withReactivity(["key"])
   effect-machine:
   └── Mark terminal states with .final() (prevents fiber leaks)
   └── Use .spawn() for state-scoped effects (auto-cancelled on exit)
   └── Use .background() for machine-lifetime effects
   └── Long work in .spawn(), NOT in .on() handlers

5. SANITY CHECK all rendered data values.
   └── Can this be NaN, null, negative, empty, or stale?
   └── Is there a fallback for each case?

6. ISOLATE failure blast radius.
   └── Does this component fetch its own data? → Own error boundary
   └── Can siblings survive this crash? → Wrap it

7. PRESERVE user work.
   └── Drafts persisted via Atom.kvs or machine .persist()?
   └── State survives navigation via keepAlive?
   └── Form NOT cleared on submission failure?
   └── Optimistic updates roll back cleanly via Atom.optimisticFn?
   └── Machine error states offer retry transitions back to safe states?
```

This is the complete checklist. If you can answer "yes" to every sub-question,
the component is resilient.
