import * as S from "effect/Schema"

export const ProjectId = S.UUID.pipe(S.brand("ProjectId"))
export type ProjectId = S.Schema.Type<typeof ProjectId>

export const FrameId = S.UUID.pipe(S.brand("FrameId"))
export type FrameId = S.Schema.Type<typeof FrameId>
