# processGLB — GLB → playable furniture pipeline (dev tool)

    npm run processGLB -- inspect <path\to\model.glb> <name>
    npm run processGLB -- propose <name>       # analysis + questions
    npm run processGLB -- answer <name>        # ABC question flow (or --accept-defaults)
    npm run processGLB -- apply <name>         # rename/flatten/axis-fix via headless Blender
    npm run processGLB -- verify <name>        # engage∥shaft, flat nodes, unique partIds — must PASS
    npm run processGLB -- install <name> --id <ID>   # copy GLB, gen parts/draft, scaffold data files, register

Then iterate `src/game/data/furnitures/<ID>/authored.ts` until:

    npm run furniture:validate -- <ID>      # 0 errors
    npm run furniture:test -- <ID>          # strict playthrough BUILT ✓

Answers are saved in `tools/processGLB/work/<name>/answers.json` — re-run `answer`
to change them, then re-run `apply`. The article knowledge base
(`tools/processGLB/articles.json`) grows with every furniture: add entries for new
IKEA article numbers so later models ask fewer questions.

Conventions enforced (see memory/fastener-glb-export-convention):
- node names `cluster_group[_index][__jointA[&jointB]]`
- fastener shaft on Blender-local +Y (head +Y) → glTF −Z engage
- flat node hierarchy (no parenting)
