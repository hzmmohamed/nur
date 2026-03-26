import { describe, it, expect } from "vitest"
import * as S from "effect/Schema"
import { YDocument } from "effect-yjs"
import { ProjectMetaSchema, type ProjectMeta } from "./project-meta"
import { ProjectIndexSchema } from "../project-index"

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000"

const makeProjectMeta = (overrides: Partial<Record<string, unknown>> = {}): ProjectMeta =>
  S.decodeUnknownSync(ProjectMetaSchema)({
    id: VALID_UUID,
    name: "Test Project",
    createdAt: 1711468800000,
    updatedAt: 1711468800000,
    ...overrides,
  })

describe("ProjectMetaSchema", () => {
  it("decodes a valid project meta object", () => {
    const result = makeProjectMeta({ name: "My Animation" })
    expect(result.id).toBe(VALID_UUID)
    expect(result.name).toBe("My Animation")
  })

  it("rejects missing required fields", () => {
    expect(() => S.decodeUnknownSync(ProjectMetaSchema)({})).toThrow()
  })

  it("rejects non-UUID id", () => {
    expect(() => makeProjectMeta({ id: "not-a-uuid" })).toThrow()
  })

  it("rejects empty name", () => {
    expect(() => makeProjectMeta({ name: "" })).toThrow()
  })

  it("rejects untrimmed name", () => {
    expect(() => makeProjectMeta({ name: "  My Project  " })).toThrow()
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
    const meta = makeProjectMeta()
    projectsLens.focus(VALID_UUID).syncSet(meta)
    const projects = projectsLens.syncGet()!
    expect(projects[VALID_UUID].name).toBe("Test Project")
  })

  it("can delete a project", () => {
    const { root } = YDocument.make(ProjectIndexSchema)
    const projectsLens = root.focus("projects")
    const meta = makeProjectMeta()
    projectsLens.focus(VALID_UUID).syncSet(meta)
    const current = projectsLens.syncGet() ?? {}
    const { [VALID_UUID]: _, ...rest } = current
    projectsLens.syncSet(rest)
    expect(projectsLens.syncGet()).toEqual({})
  })
})
