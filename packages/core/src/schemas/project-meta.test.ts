import { describe, it, expect } from "vitest"
import * as S from "effect/Schema"
import { YDocument } from "effect-yjs"
import { ProjectMetaSchema } from "./project-meta"
import { ProjectIndexSchema } from "../project-index"

describe("ProjectMetaSchema", () => {
  it("decodes a valid project meta object", () => {
    const data = {
      id: "abc-123",
      name: "My Animation",
      createdAt: 1711468800000,
      updatedAt: 1711468800000,
    }
    const result = S.decodeUnknownSync(ProjectMetaSchema)(data)
    expect(result.id).toBe("abc-123")
    expect(result.name).toBe("My Animation")
  })

  it("rejects missing required fields", () => {
    expect(() => S.decodeUnknownSync(ProjectMetaSchema)({})).toThrow()
  })
})

describe("ProjectIndex Y.Doc", () => {
  it("creates a Y.Doc with projects record", () => {
    const { root } = YDocument.make(ProjectIndexSchema)
    const projects = root.focus("projects").syncGet()
    expect(projects).toEqual({})
  })

  it("can add and read a project", () => {
    const { root } = YDocument.make(ProjectIndexSchema)
    const projectsLens = root.focus("projects")
    projectsLens.focus("abc-123").syncSet({
      id: "abc-123",
      name: "Test Project",
      createdAt: 1711468800000,
      updatedAt: 1711468800000,
    })
    const projects = projectsLens.syncGet()!
    expect(projects["abc-123"].name).toBe("Test Project")
  })

  it("can delete a project", () => {
    const { root } = YDocument.make(ProjectIndexSchema)
    const projectsLens = root.focus("projects")
    projectsLens.focus("abc-123").syncSet({
      id: "abc-123",
      name: "Test Project",
      createdAt: 1711468800000,
      updatedAt: 1711468800000,
    })
    const current = projectsLens.syncGet() ?? {}
    const { "abc-123": _, ...rest } = current
    projectsLens.syncSet(rest)
    expect(projectsLens.syncGet()).toEqual({})
  })
})
