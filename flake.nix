{
  nixConfig = {
    extra-substituters = ["https://cache.numtide.com"];
    extra-trusted-public-keys = ["niks3.numtide.com-1:DTx8wZduET09hRmMtKdQDxNNthLQETkc/yaX7M4qK0g="];
  };

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs?rev=e576e3c9cf9bad747afcddd9e34f51d18c855b4e";
    llm-agents.url = "github:numtide/llm-agents.nix";

    lalph-src = {
      url = "github:tim-smart/lalph";
      flake = false;
    };
  };

  outputs = {
    nixpkgs,
    llm-agents,
    lalph-src,
    ...
  }: let
    forAllSystems = function:
      nixpkgs.lib.genAttrs nixpkgs.lib.systems.flakeExposed
      (system: function nixpkgs.legacyPackages.${system});
  in {
    formatter = forAllSystems (pkgs: pkgs.alejandra);

    packages = forAllSystems (pkgs: let
      pnpm = pkgs.pnpm_10.override {nodejs = pkgs.nodejs_24;};
    in {
      lalph = pkgs.stdenv.mkDerivation (finalAttrs: {
        pname = "lalph";
        version = "0.3.114";
        src = lalph-src;

        nativeBuildInputs = with pkgs; [
          nodejs_24
          pnpm
          pkgs.pnpmConfigHook
          python3
          pkg-config
          makeWrapper
        ];

        buildInputs = with pkgs; [
          sqlite
        ];

        pnpmDeps = pkgs.fetchPnpmDeps {
          inherit (finalAttrs) pname version src;
          inherit pnpm;
          fetcherVersion = 3;
          hash = "sha256-YgPeTlhk/CrSx6SdA1iPdUR2/zSG22rPFDaitEDU1Q8=";
        };

        buildPhase = ''
          runHook preBuild
          pnpm run build
          runHook postBuild
        '';

        installPhase = ''
          runHook preInstall
          mkdir -p $out/lib/lalph $out/bin
          cp -r dist node_modules package.json $out/lib/lalph/
          makeWrapper ${pkgs.nodejs_24}/bin/node $out/bin/lalph \
            --add-flags "$out/lib/lalph/dist/cli.mjs" \
            --prefix PATH : ${pkgs.lib.makeBinPath [pkgs.gh pkgs.git]}
          runHook postInstall
        '';

        meta = {
          description = "LLM agent orchestrator driven by your chosen source of issues";
          homepage = "https://github.com/tim-smart/lalph";
          license = pkgs.lib.licenses.mit;
        };
      });
    });

    devShells = forAllSystems (pkgs: let
      agents = llm-agents.packages.${pkgs.stdenv.hostPlatform.system};
    in {
      default = pkgs.mkShell {
        packages =
          (with pkgs; [
            corepack
            nodejs_24
            bun
            gh
            # For systems that do not ship with Python by default (required by `node-gyp`)
            python3
          ])
          ++ (with agents; [
            claude-code
            ccusage
            ralph-tui
            workmux
          ]);
      };
    });
  };
}
