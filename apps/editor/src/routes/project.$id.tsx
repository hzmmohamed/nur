import { createFileRoute } from "@tanstack/react-router"
import { css } from "../../styled-system/css"

export const Route = createFileRoute("/project/$id")({
  component: ProjectEditorPage,
})

function ProjectEditorPage() {
  const { id } = Route.useParams()
  return (
    <div className={css({ p: "6" })}>
      <h1 className={css({ fontSize: "2xl", fontWeight: "bold" })}>
        Editor: {id}
      </h1>
    </div>
  )
}
