import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { Atom, Result } from "@effect-atom/atom"
import { useAtom, useAtomValue } from "@effect-atom/atom-react/Hooks"
import { useProjectIndex } from "../hooks/use-project-index"
import { userProfileAtom } from "../lib/user-profile"
import { thumbnailAtom } from "../lib/thumbnail-cache"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { appRegistry } from "../lib/atom-registry"

const newNameAtom = Atom.make("")
const onboardingNameAtom = Atom.make("")

export const Route = createFileRoute("/")({
  component: HomePage,
})

function HomePage() {
  const profile = useAtomValue(userProfileAtom)

  if (!profile) return <Onboarding />
  return <ProjectListPage userName={profile.name} />
}

// -- Onboarding --

function Onboarding() {
  const [name, setName] = useAtom(onboardingNameAtom)

  const handleSubmit = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    appRegistry.set(userProfileAtom, { name: trimmed })
  }

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="flex flex-col items-center gap-6 max-w-sm w-full px-8">
        <h1 className="text-3xl font-bold">Welcome to NUR</h1>
        <p className="text-muted-foreground text-center text-sm">
          A tool for traditional 2D hand-drawn animators.
          Enter your name to get started.
        </p>
        <div className="flex gap-2 w-full">
          <Input
            placeholder="Your name..."
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            autoFocus
          />
          <Button onClick={handleSubmit} disabled={!name.trim()}>
            Get Started
          </Button>
        </div>
      </div>
    </div>
  )
}

// -- Project List --

function ProjectListPage({ userName }: { userName: string }) {
  const { projects, createProject, deleteProject } = useProjectIndex()
  const navigate = useNavigate()
  const [newName, setNewName] = useAtom(newNameAtom)

  const handleCreate = () => {
    const trimmed = newName.trim()
    if (!trimmed) return
    const id = createProject(trimmed)
    setNewName("")
    navigate({ to: "/project/$id", params: { id } })
  }

  const projectList = Object.values(projects).sort(
    (a, b) => b.updatedAt - a.updatedAt
  )

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="flex items-center justify-between px-8 py-4 border-b border-border">
        <h1 className="text-lg font-semibold">NUR</h1>
        <div className="flex items-center gap-2">
          <div className="size-7 rounded-full bg-accent flex items-center justify-center text-xs font-medium text-accent-foreground">
            {userName.charAt(0).toUpperCase()}
          </div>
          <span className="text-sm text-muted-foreground">{userName}</span>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-8 py-8">
        {/* Greeting + Create */}
        <div className="flex items-end justify-between mb-8">
          <div>
            <h2 className="text-2xl font-bold">Welcome back, {userName}</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {projectList.length === 0
                ? "Create your first project to get started."
                : `${projectList.length} project${projectList.length > 1 ? "s" : ""}`
              }
            </p>
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="New project name..."
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              className="w-48"
            />
            <Button onClick={handleCreate} disabled={!newName.trim()}>
              + New Project
            </Button>
          </div>
        </div>

        {/* Project Grid */}
        {projectList.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <p className="text-muted-foreground mb-4">No projects yet</p>
            <Button
              onClick={() => {
                const id = createProject("Untitled")
                navigate({ to: "/project/$id", params: { id } })
              }}
            >
              + Create Project
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {projectList.map((project) => (
              <ProjectCard
                key={project.id}
                name={project.name}
                updatedAt={project.updatedAt}
                frameCount={(project as any).frameCount ?? 0}
                frameHashes={(project as any).frameHashes ?? []}
                onClick={() => navigate({ to: "/project/$id", params: { id: project.id } })}
                onDelete={() => deleteProject(project.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// -- Project Card --

const hoverFrameIndexAtom = Atom.make<{ projectId: string; index: number } | null>(null)

function ProjectCard({
  name,
  updatedAt,
  frameCount,
  frameHashes,
  onClick,
  onDelete,
}: {
  name: string
  updatedAt: number
  frameCount: number
  frameHashes: string[]
  onClick: () => void
  onDelete: () => void
}) {
  const hoverState = useAtomValue(hoverFrameIndexAtom)

  // Determine which frame to show
  const displayIndex = hoverState && frameHashes.length > 0
    ? Math.min(hoverState.index, frameHashes.length - 1)
    : 0
  const displayHash = frameHashes[displayIndex]

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (frameHashes.length <= 1) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const ratio = x / rect.width
    const index = Math.floor(ratio * frameHashes.length)
    appRegistry.set(hoverFrameIndexAtom, { projectId: name, index })
  }

  const handleMouseLeave = () => {
    appRegistry.set(hoverFrameIndexAtom, null)
  }

  return (
    <div
      className="group rounded-lg border border-border bg-card overflow-hidden cursor-pointer transition-colors hover:border-muted-foreground/30"
      role="button"
      tabIndex={0}
      aria-label={`Open project ${name}`}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onClick()
        }
      }}
    >
      {/* Thumbnail area */}
      <div
        className="aspect-video bg-muted/30 flex items-center justify-center relative overflow-hidden"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {displayHash ? (
          <ThumbnailImage contentHash={displayHash} />
        ) : (
          <span className="text-xs text-muted-foreground">No preview</span>
        )}
        {frameCount > 0 && (
          <span className="absolute bottom-2 right-2 text-xs bg-background/80 backdrop-blur-sm px-1.5 py-0.5 rounded tabular-nums">
            {frameCount} frames
          </span>
        )}
        {/* Scrub progress indicator */}
        {hoverState && frameHashes.length > 1 && (
          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-muted">
            <div
              className="h-full bg-foreground/50 transition-all duration-75"
              style={{ width: `${((displayIndex + 1) / frameHashes.length) * 100}%` }}
            />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex items-center justify-between p-3">
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{name}</p>
          <p className="text-xs text-muted-foreground">
            {formatRelativeTime(updatedAt)}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          aria-label={`Delete project ${name}`}
        >
          <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14" />
          </svg>
        </Button>
      </div>
    </div>
  )
}

function ThumbnailImage({ contentHash }: { contentHash: string }) {
  const result = useAtomValue(thumbnailAtom(contentHash))
  const url = Result.isSuccess(result) ? result.value : undefined

  if (!url) {
    return <span className="text-xs text-muted-foreground">Loading...</span>
  }

  return (
    <img
      src={url}
      alt=""
      className="w-full h-full object-cover"
    />
  )
}

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp
  const seconds = Math.floor(diff / 1000)
  if (seconds < 10) return "just now"
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(timestamp).toLocaleDateString()
}
