import { css } from "../styled-system/css"

export function App() {
  return (
    <div className={css({ display: "flex", alignItems: "center", justifyContent: "center", minH: "screen" })}>
      <h1 className={css({ fontSize: "2xl", fontWeight: "bold" })}>NUR</h1>
    </div>
  )
}
