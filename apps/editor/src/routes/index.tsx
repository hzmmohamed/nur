import { createFileRoute } from "@tanstack/react-router"
import { css } from "../../styled-system/css"

export const Route = createFileRoute("/")({
  component: ProjectListPage,
})

function ProjectListPage() {
  return (
    <div className={css({ p: "6" })}>
      <h1 className={css({ fontSize: "2xl", fontWeight: "bold", mb: "4" })}>
        NUR Projects
      </h1>
      <p>Project list will go here.</p>
    </div>
  )
}
