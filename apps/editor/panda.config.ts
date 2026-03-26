import { green } from "@/theme/colors/green";
import { red } from "@/theme/colors/red";
import { neutral } from "@/theme/colors/neutral";
import { bronze } from "@/theme/colors/bronze";
import { animationStyles } from "@/theme/animation-styles";
import { zIndex } from "@/theme/tokens/z-index";
import { shadows } from "@/theme/tokens/shadows";
import { durations } from "@/theme/tokens/durations";
import { colors } from "@/theme/tokens/colors";
import { textStyles } from "@/theme/text-styles";
import { layerStyles } from "@/theme/layer-styles";
import { keyframes } from "@/theme/keyframes";
import { globalCss } from "@/theme/global-css";
import { conditions } from "@/theme/conditions";
import { slotRecipes, recipes } from "@/theme/recipes";
import { defineConfig } from "@pandacss/dev"
import { createPreset } from "@park-ui/panda-preset"

export default defineConfig({
  preflight: true,

  presets: [
    "@pandacss/preset-base",
    createPreset({
      accentColor: "neutral",
      grayColor: "neutral",
      borderRadius: "md",
    }),
  ],

  include: [
    "./src/**/*.{ts,tsx}",
    "./node_modules/@nur/design-system/src/**/*.{ts,tsx}",
  ],

  outdir: "styled-system",
  jsxFramework: "react",

  plugins: [
    {
      name: "Remove Panda Preset Colors",
      hooks: {
        "preset:resolved": ({ utils, preset, name }) =>
          name === "@pandacss/preset-panda"
            ? utils.omit(preset, ["theme.tokens.colors", "theme.semanticTokens.colors"])
            : preset,
      },
    },
  ],

  globalCss: globalCss,
  conditions: conditions,

  theme: {
    extend: {
      animationStyles: animationStyles,
      recipes: recipes,
      slotRecipes: slotRecipes,
      keyframes: keyframes,
      layerStyles: layerStyles,
      textStyles: textStyles,

      tokens: {
        colors: colors,
        durations: durations,
        zIndex: zIndex
      },

      semanticTokens: {
        colors: {
          fg: {
            default: {
              value: {
                _light: "{colors.gray.12}",
                _dark: "{colors.gray.12}"
              }
            },

            muted: {
              value: {
                _light: "{colors.gray.11}",
                _dark: "{colors.gray.11}"
              }
            },

            subtle: {
              value: {
                _light: "{colors.gray.10}",
                _dark: "{colors.gray.10}"
              }
            }
          },

          border: {
            value: {
              _light: "{colors.gray.4}",
              _dark: "{colors.gray.4}"
            }
          },

          error: {
            value: {
              _light: "{colors.red.9}",
              _dark: "{colors.red.9}"
            }
          },

          bronze: bronze,
          gray: neutral,
          red: red,
          green: green
        },

        shadows: shadows,

        radii: {
          l1: {
            value: "{radii.xs}"
          },

          l2: {
            value: "{radii.sm}"
          },

          l3: {
            value: "{radii.md}"
          }
        }
      }
    }
  }
})