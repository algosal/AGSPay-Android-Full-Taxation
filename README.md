# 💳 AGPay — Android (Tap to Pay)

🚀 **Fully working AGPay Android application** for **Android phones with NFC**, supporting **Tap to Pay** with **contactless credit & debit cards**.

This repository contains the **stable, production-ready Android phone build** of AGPay.

---

## ✨ Key Features

✅ **Tap to Pay on Android**

- Uses built-in **NFC hardware**
- Accepts contactless **Visa, Mastercard, Amex**, etc.
- No external reader required (on supported devices)

✅ **Complete Checkout Flow**

```

Amount → Tip → Payment Method → Receipt

```

✅ **Store Terminal Mode**

- Terminal screen can remain open indefinitely
- Safe to connect / disconnect reader at any time
- Designed for real-world retail & vendor usage

✅ **Receipts**

- 📧 Email receipts supported
- 🧾 Receipt breakdown includes:
  - Subtotal
  - Sales tax
  - Service fee
  - Tip
  - Total

✅ **Android-First UX**

- Optimized for **phones**, not tablets
- Touch-first layout
- Works on real devices (not emulator-only)

---

## 📱 Device Requirements

- **Android phone with NFC**
- NFC **enabled** in system settings
- Internet connection (auth + payment processing)
- Supported Android version per Stripe Tap to Pay requirements

> ⚠️ Tablets are **not guaranteed** unless explicitly supported in a separate build or branch.

---

## 🛠️ Tech Stack

- **React Native**
- **Stripe Terminal (Tap to Pay on Android)**
- **NFC-based contactless payments**
- Secure backend APIs for auth, verification, and receipts

---

## ⚙️ Setup

Install dependencies:

```bash
npm install
```

---

## ▶️ Run on Android

Using CLI:

```bash
npx react-native run-android
```

Or:

- Open the `android/` folder in **Android Studio**
- Build & run on a **physical NFC-enabled device**

---

## 🧪 Testing Notes

- Emulator **will not** support Tap to Pay
- Use a **real Android phone with NFC**
- Ensure NFC is turned ON before launching the app

---

## 🔐 Security & Compliance

- Secure authentication flow
- Role verification enforced via backend
- No sensitive card data stored on device
- Payments handled via Stripe’s compliant infrastructure

---

## 📦 Repository Status

✅ **Stable**
✅ **Production-ready**
✅ **Actively used on Android phones with NFC**

This repo represents the **current, working Android phone implementation** of AGPay with Tap to Pay.

---

## 🏁 Summary

**AGPay Android** enables modern, readerless, contactless payments directly on supported Android phones — delivering a clean terminal experience, secure checkout flow, and professional receipts.

💳 Tap. Pay. Done.

```

```
