import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useState } from "react"
import { useProjectIndex } from "../hooks/use-project-index"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

export const Route = createFileRoute("/")({
  component: ProjectListPage,
})

function ProjectListPage() {
  const { projects, createProject, deleteProject } = useProjectIndex()
  const navigate = useNavigate()
  const [newName, setNewName] = useState("")

  const handleCreate = () => {
    const trimmed = newName.trim()
    if (!trimmed) return
    const id = createProject(trimmed)
    setNewName("")
    navigate({ to: "/project/$id", params: { id } })
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleCreate()
  }

  const projectList = Object.values(projects).sort(
    (a, b) => b.updatedAt - a.updatedAt
  )

  return (
    <div className="max-w-2xl mx-auto p-8">
      <h1 className="text-3xl font-bold mb-6">NUR</h1>

      <div className="flex gap-2 mb-6">
        <div className="flex-1">
          <Input
            placeholder="New project name..."
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>
        <Button onClick={handleCreate}>Create</Button>
      </div>

      {projectList.length === 0 ? (
        <p className="text-muted-foreground">
          No projects yet. Create one to get started.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {projectList.map((project) => (
            <Card
              key={project.id}
              className="cursor-pointer hover:bg-accent/50 transition-colors"
              onClick={() => navigate({ to: "/project/$id", params: { id: project.id } })}
            >
              <CardContent className="p-3">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="font-medium">{project.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {new Date(project.updatedAt).toLocaleDateString()}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation()
                      deleteProject(project.id)
                    }}
                  >
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
