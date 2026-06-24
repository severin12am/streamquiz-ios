# Universal Links — deploy to Netlify (web project)

When this file is live on your site, tapping `https://streamquiz.netlify.app/game/{uuid}` on an iPhone **with WhoSmarter installed** opens the app directly into that game (guest join).

If the app is **not** installed, the link opens in Safari as usual.

## 1. Fill in your Apple Team ID

Edit `apple-app-site-association` and replace `REPLACE_WITH_APPLE_TEAM_ID` with your 10-character Team ID from [Apple Developer → Membership](https://developer.apple.com/account).

The bundle identifier is already set to the app's real id (`com.severin.whosmarter`, see `app.config.ts`). Only the Team ID prefix is missing.

Example final value: `AB12CD34EF.com.severin.whosmarter`

## 2. Copy to the **web** repo (Next.js on Netlify)

Place the file at:

```
public/.well-known/apple-app-site-association
```

No file extension. Commit and deploy.

## 3. Netlify headers (web `netlify.toml`)

Ensure JSON content-type (required by Apple):

```toml
[[headers]]
  for = "/.well-known/apple-app-site-association"
  [headers.values]
    Content-Type = "application/json"
```

## 4. Rebuild the iOS app

After `app.config.ts` has `associatedDomains`, run:

```bash
npx expo prebuild --platform ios --clean
npx expo run:ios
```

Universal Links do **not** work in Simulator reliably — test on a physical iPhone.

## 5. Verify

- Install the dev build on iPhone.
- Send yourself an iMessage with `https://streamquiz.netlify.app/game/{real-uuid}`.
- Long-press or tap → should offer **Open in WhoSmarter**.

Apple’s CDN caches AASA files; changes can take up to 24h (often minutes).
