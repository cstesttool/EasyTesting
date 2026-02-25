# Publishing CSTesting to npm and giving it to end users

## 1. One-time setup

### Create an npm account
- Go to [https://www.npmjs.com/signup](https://www.npmjs.com/signup) and create an account.
- Optionally enable 2FA for security: npm → Account → Enable 2FA.

### Login from your machine
```bash
npm login
```
Enter your npm username, password, and email when prompted.

### Fix package name (if needed)
- The name `cstesting` might already be taken on npm. Check: [https://www.npmjs.com/package/cstesting]( =
- If taken, use a **scoped name** in `package.json`:
  ```json
  "name": "@your-npm-username/cstesting"
  ```
  Then users install with: `npm install @your-npm-username/cstesting`

### Update package.json for your identity
In `package.json` set:
- `"author": "Your Name <your@email.com>"`
- Replace `YOUR_USERNAME` in `repository`, `homepage`, and `bugs` with your GitHub username (or remove those fields if you don’t use GitHub).

---

## 2. Before every publish

1. **Bump version** in `package.json`:
   - Patch (bug fixes): `0.1.0` → `0.1.1`
   - Minor (new features): `0.1.0` → `0.2.0`
   - Major (breaking changes): `0.1.0` → `1.0.0`
   ```bash
   npm version patch   # or minor / major
   ```

2. **Build**
   ```bash
   npm run build
   ```

3. **Optional: dry run** (see what would be published, no upload)
   ```bash
   npm publish --dry-run
   ```
   Check that only `dist/` and `README.md` are listed (no `src/`, `example/`, etc.).

---

## 3. Publish to npm

```bash
npm publish
```

- First time: publishes the package to the public registry.
- If you use a **scoped** name (e.g. `@myuser/cstesting`), publish with:
  ```bash
  npm publish --access public
  ```

Your package will be live at: `https://www.npmjs.com/package/cstesting` (or your scoped name).

---

## 4. How end users get and use it

### Install (as a dependency)
```bash
npm install cstesting
```
Or with a scoped name:
```bash
npm install @your-username/cstesting
```

### Run tests without installing (npx)
```bash
npx cstesting
npx cstesting "**/*.test.js"
npx et
```

### Use in code
```js
const { describe, it, expect, createBrowser } = require('cstesting');

describe('My tests', () => {
  it('works', () => {
    expect(1 + 1).toBe(2);
  });
});
```

### Use the CLI
After `npm install cstesting`:
```bash
npx cstesting
# or add to package.json scripts:
"scripts": {
  "test": "cstesting"
}
```
Then: `npm test`

---

## 5. After publishing

- **Update README** with the real npm package name and repo URL.
- **Tag a release** in Git: `git tag v0.1.0 && git push --tags`
- To **update** the package: change version, run `npm run build`, then `npm publish` again.

---

## Quick checklist

| Step | Command / action |
|------|------------------|
| 1. npm account | Sign up at npmjs.com |
| 2. Login | `npm login` |
| 3. Name | Ensure `name` in package.json is free or use `@scope/cstesting` |
| 4. Version | `npm version patch` (or minor/major) |
| 5. Build | `npm run build` |
| 6. Dry run | `npm publish --dry-run` |
| 7. Publish | `npm publish` (or `npm publish --access public` for scoped) |

End users then run: **`npm install cstesting`** and **`npx cstesting`**.
