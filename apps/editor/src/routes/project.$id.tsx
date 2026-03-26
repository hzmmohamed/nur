import { createFileRoute, Link } from "@tanstack/react-router"
import { css } from "../../styled-system/css"
import { useProjectDoc } from "../hooks/use-project-doc"

export const Route = createFileRoute("/project/$id")({
  component: ProjectEditorPage,
})

function ProjectEditorPage() {
  const { id } = Route.useParams()
  const { root, ready } = useProjectDoc(id)

  if (!ready) {
    return (
      <div className={css({ display: "flex", justifyContent: "center", alignItems: "center", minH: "screen" })}>
        <p>Loading project...</p>
      </div>
    )
  }

  const name = root.focus("name").syncGet() || "Untitled"
  const frames = root.focus("frames").syncGet() ?? {}
  const frameCount = Object.keys(frames).length

  return (
    <div className={css({ h: "screen", display: "flex", flexDirection: "column" })}>
      <header className={css({
        display: "flex",
        alignItems: "center",
        gap: "4",
        px: "4",
        py: "2",
        borderBottom: "1px solid",
        borderColor: "border.default",
      })}>
        <Link
          to="/"
          className={css({ color: "fg.muted", _hover: { color: "fg.default" } })}
        >
          Back
        </Link>
        <h1 className={css({ fontSize: "lg", fontWeight: "medium" })}>{name}</h1>
        <span className={css({ fontSize: "sm", color: "fg.muted" })}>
          {frameCount} frames
        </span>
      </header>
      <main className={css({ flex: "1", display: "flex", alignItems: "center", justifyContent: "center" })}>
        <p className={css({ color: "fg.muted" })}>
          Editor canvas will go here (Objective 3+)
        </p>
      </main>
    </div>
  )
}
