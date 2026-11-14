# ConvoyGo: rules for every change

ConvoyGo is proprietary software owned by Pranab Sinha (see LICENSE). All rights reserved.

## Documentation is part of every change
The product documentation lives in `C:\Users\Pranab\Desktop\convoygo-v2\docs`, its own private repo `Sinha0007/convoygo-docs`. A change is not finished until the docs are updated and pushed:

1. Update the page(s) the change affects (features, api, app, backend, maps, testing, operations, release-plan, costs…).
2. Add a dated entry at the top of `CHANGELOG.md` with what changed and the commit hashes in each repo.
3. Commit and push the docs repo.

Never put secrets (env values, keys, tokens, database URLs), the `sales` folder or personal contact details in the docs.
