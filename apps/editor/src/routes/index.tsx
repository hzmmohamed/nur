import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useState } from "react"
import { css } from "../../styled-system/css"
import { useProjectIndex } from "../hooks/use-project-index"

export const Route = createFileRoute("/")({
  component: ProjectListPage,
})

function ProjectListPage() {
  const { projects, ready, createProject, deleteProject } = useProjectIndex()
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

  if (!ready) {
    return (
      <div className={css({ display: "flex", justifyContent: "center", alignItems: "center", minH: "screen" })}>
        <p>Loading...</p>
      </div>
    )
  }

  return (
    <div className={css({ maxW: "2xl", mx: "auto", p: "8" })}>
      <h1 className={css({ fontSize: "3xl", fontWeight: "bold", mb: "6" })}>
        NUR
      </h1>

      <div className={css({ display: "flex", gap: "2", mb: "6" })}>
        <input
          className={css({
            flex: "1",
            px: "3",
            py: "2",
            border: "1px solid",
            borderColor: "border.default",
            borderRadius: "md",
            bg: "bg.default",
            color: "fg.default",
          })}
          type="text"
          placeholder="New project name..."
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button
          className={css({
            px: "4",
            py: "2",
            bg: "bg.emphasized",
            color: "fg.default",
            borderRadius: "md",
            cursor: "pointer",
            _hover: { bg: "bg.muted" },
          })}
          onClick={handleCreate}
        >
          Create
        </button>
      </div>

      {projectList.length === 0 ? (
        <p className={css({ color: "fg.muted" })}>
          No projects yet. Create one to get started.
        </p>
      ) : (
        <ul className={css({ display: "flex", flexDirection: "column", gap: "2" })}>
          {projectList.map((project) => (
            <li
              key={project.id}
              className={css({
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                p: "3",
                border: "1px solid",
                borderColor: "border.default",
                borderRadius: "md",
                cursor: "pointer",
                _hover: { bg: "bg.muted" },
              })}
              onClick={() => navigate({ to: "/project/$id", params: { id: project.id } })}
            >
              <div>
                <div className={css({ fontWeight: "medium" })}>{project.name}</div>
                <div className={css({ fontSize: "sm", color: "fg.muted" })}>
                  {new Date(project.updatedAt).toLocaleDateString()}
                </div>
              </div>
              <button
                className={css({
                  px: "2",
                  py: "1",
                  fontSize: "sm",
                  color: "fg.muted",
                  borderRadius: "sm",
                  cursor: "pointer",
                  _hover: { bg: "bg.subtle", color: "fg.default" },
                })}
                onClick={(e) => {
                  e.stopPropagation()
                  deleteProject(project.id)
                }}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
