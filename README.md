# AGPay (Android)

Fully working AGPay Android application for **Android cell phones with NFC chips**, supporting **Tap to Pay** with **contactless credit/debit cards**.

## What this repo contains

- Production-ready Android build of AGPay
- Tap to Pay reader flow (NFC-based on supported Android phones)
- End-to-end checkout flow:
  - Amount → Tip → Payment Method → Receipt
- Store mode terminal screen (safe to open anytime)
- Receipt flow (email receipt supported; printing may be optional depending on device setup)

## Requirements

- **Android phone with NFC**
- NFC enabled in device settings
- Internet connectivity (required for auth + processing)
- Test/Live credentials configured in the app/backend as appropriate

## Setup

```bash
npm install
```

## Run (Android)

```bash
npx react-native run-android
```

Or open the `android/` folder in Android Studio and run the app.

## Notes

- This project is intended specifically for **Android phones** (not tablets unless explicitly supported in a separate branch/build).
- Tap to Pay behavior depends on device compatibility and enabled NFC hardware.

## Repo status

✅ Fully working code for Android phones with NFC + Tap to Pay credit cards.

```

```

```

```
