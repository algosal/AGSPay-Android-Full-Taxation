# 💳 AGPay — Android Tablet (Tap to Pay)

🚧 **AGPay Android Tablet build** for **NFC-enabled Android tablets**, supporting **Tap to Pay** with contactless credit & debit cards.

This repository contains the **tablet-focused variant** of AGPay. The core payment flow is functional, with **ongoing device-specific tuning** in progress.

---

## ✨ What Works Today

✅ **Tap to Pay on Android (Tablet)**

- Uses built-in **NFC hardware**
- Accepts contactless **credit & debit cards**
- Stripe Terminal integration active

✅ **Complete Checkout Flow**

```

Amount → Tip → Payment Method → Receipt

```

✅ **Store Terminal Mode**

- Terminal screen can remain open indefinitely
- Reader connect / disconnect supported
- Designed for counter-style tablet usage

✅ **Receipts**

- 📧 Email receipts supported
- 🧾 Full breakdown:
  - Subtotal
  - Sales tax
  - Service fee
  - Tip
  - Total

---

## ⚠️ Known Tablet-Specific Issue (In Progress)

🚧 **NFC tag read behavior on tablets**

- Some Android tablets handle NFC tag discovery differently than phones
- Occasional inconsistency when reading Tap to Pay card tags
- Being actively tested and adjusted on real hardware

> A tablet device is scheduled for hands-on debugging and tuning.  
> Fixes will be applied before backend expansion (DynamoDB + Lambda work).

---

## 📱 Device Requirements

- **Android tablet with NFC**
- NFC **enabled** in system settings
- Internet connection (auth + payment processing)
- Supported Android version per Stripe Tap to Pay requirements

> ⚠️ Not all tablets implement NFC identically. Device compatibility testing is ongoing.

---

## 🛠️ Tech Stack

- **React Native**
- **Stripe Terminal (Tap to Pay on Android)**
- **NFC-based contactless payments**
- Backend APIs (auth, verification, receipts)

---

## ⚙️ Setup

Install dependencies:

```bash
npm install
```

---

## ▶️ Run on Android Tablet

```bash
npx react-native run-android
```

Or:

- Open the `android/` folder in **Android Studio**
- Build & run on a **physical NFC-enabled tablet**

> ⚠️ Emulator will NOT support Tap to Pay.

---

## 🧪 Testing Notes

- Always test on **real hardware**
- Ensure NFC is enabled before launching the app
- Keep device unlocked during Tap to Pay interactions

---

## 🗺️ Roadmap (Short-Term)

- 🔧 Fix tablet NFC tag detection consistency
- 🧪 Validate Tap to Pay flow across tablet models
- 🧠 Then proceed to:

  - DynamoDB transaction aggregation
  - Sales-of-the-day Lambda
  - Backend optimizations

---

## 📦 Repository Status

🟡 **Functional, under active tablet tuning**
🟢 Core payment flow working
🔧 Device-specific NFC adjustments in progress

---

## 🏁 Summary

This repository represents the **Android Tablet build of AGPay**, sharing the same payment architecture as the phone version, with additional work underway to accommodate tablet-specific NFC behavior.

Once NFC tuning is finalized, backend expansion will resume.

💳 Bigger screen. Same secure payments.

```

```
