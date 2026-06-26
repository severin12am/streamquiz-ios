# Universal Links — deploy to Netlify (web project)

When this file is live on your site, tapping `https://whosmarter.com/game/{uuid}` on an iPhone **with WhoSmarter installed** opens the app directly into that game (guest join).

Legacy Netlify URLs (`https://streamquiz.netlify.app/game/{uuid}`) still open the app if that hostname also serves the same AASA file.

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

No file extension. Commit and deploy to the site that serves **whosmarter.com** (and streamquiz.netlify.app if you keep both domains).

## 3. Netlify headers (web `netlify.toml`)

Ensure JSON content-type (required by Apple):

```toml
[[headers]]
  for = "/.well-known/apple-app-site-association"
  [headers.values]
    Content-Type = "application/json"
```

## 4. Rebuild the iOS app

After `EXPO_PUBLIC_API_BASE_URL=https://whosmarter.com` and `associatedDomains` in `app.config.ts`, run:

```bash
npx expo prebuild --platform ios --clean
npx expo run:ios
```

Universal Links do **not** work in Simulator reliably — test on a physical iPhone.

## 5. Verify

- Install the dev build on iPhone.
- Send yourself an iMessage with `https://whosmarter.com/game/{real-uuid}`.
- Long-press or tap → should offer **Open in WhoSmarter**.

Apple’s CDN caches AASA files; changes can take up to 24h (often minutes).
