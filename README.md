# 📟 AGPay Android Tablet (No Built-In NFC) — USB External Reader Notes (Samsung)

Welcome to the **AGPay Android Tablet** variant that targets **Samsung tablets with no built-in NFC**, using an **external USB-C contactless smart card/NFC reader**.

This README captures **exactly what we verified**, **the working ADB commands**, and **how we confirmed the tablet is acting as USB Host (OTG)** and can **detect the reader**.

---

## ✅ Goal

Enable AGPay on a Samsung tablet **without internal NFC**, by using:

- 🔌 **External USB-C contactless reader**
- 📲 Tablet in **USB Host mode (DFP / Host)**
- 🧪 Confirm device detection via `adb` + `dumpsys usb` + `lsusb`

---

## 🧩 Hardware

### 📱 Tablet

- **Model:** `SM-X218U`
- **Device:** `gta9p`
- **Build Fingerprint:**

```

samsung/gta9psqx/gta9p:11/RP1A.200720.012/X218USQS9DYJ6:user/release-keys

```

### 🔌 External Reader

- **Product name shown by Android:** `EMV Smartcard Reader`
- **Vendor ID:** `11491`
- **Product ID:** `38247`

Also visible in Linux-style USB IDs:

- `2ce3:9567`

📦 Amazon item (reference):

- CAC NFC Smart Card Reader Military, Dual Interface USB DOD Military ID/IC Card Reader with Contactless NFC Tap-to-Read  
  (USB-C adapter included)

---

## 🔥 What We Confirmed (Critical)

### ✅ Tablet enters USB Host mode

We confirmed the tablet successfully becomes **Host**:

- `host_connected=true`
- `current_mode=dfp`
- `power_role=source`
- `data_role=host`

That means OTG/host mode is active and Android should be able to talk to USB devices.

---

## 🧪 Step-by-Step Verification

### 1) Confirm ADB sees the tablet

```bash
adb devices
```

Example:

```
List of devices attached
192.168.1.22:38967 device
```

---

### 2) Confirm USB role & host mode (MOST IMPORTANT)

```bash
adb -s 192.168.1.22:38967 shell dumpsys usb | findstr /i "host_connected current_mode data_role power_role"
```

✅ Expected output (host mode):

```
host_connected=true
current_mode=dfp
power_role=source
data_role=host
```

If you see:

```
host_connected=false
current_mode=ufp
data_role=device
```

❌ that means the tablet is NOT acting as host (no OTG).

---

### 3) Confirm the USB reader is detected (VID/PID + product name)

```bash
adb -s 192.168.1.22:38967 shell dumpsys usb | findstr /i "vendor_id product_id product_name EMV Smartcard Reader"
```

✅ Expected:

```
vendor_id=11491
product_id=38247
product_name=EMV Smartcard Reader
```

---

### 4) Confirm it appears in `/dev/bus/usb` + `lsusb`

```bash
adb -s 192.168.1.22:38967 shell ls -la /dev/bus/usb
adb -s 192.168.1.22:38967 shell lsusb
```

✅ Example `lsusb`:

```
Bus 002 Device 002: ID 2ce3:9567
```

---

### 5) Confirm tablet identity (optional)

```bash
adb -s 192.168.1.22:38967 shell getprop ro.product.model
adb -s 192.168.1.22:38967 shell getprop ro.product.device
adb -s 192.168.1.22:38967 shell getprop ro.vendor.build.fingerprint
```

---

## 📡 Using ADB over Wi-Fi (Because USB-C port is occupied)

Since the reader uses the only USB-C port, we switched to **ADB over Wi-Fi** to keep debugging while the reader stays connected.

### ✅ Working approach

1. Use the tablet’s Developer Options:

   - **Wireless debugging ✅**
   - Pair device / connect

2. Connect from PC:

```bash
adb connect 192.168.1.22:38967
```

3. Use `-s` always (multi-device safety):

```bash
adb -s 192.168.1.22:38967 shell whoami
```

✅ Expected:

```
shell
```

---

## 🛑 Common Problem: “adb tcpip 5555” fails / “error: closed”

This is normal in some setups (especially when switching transport modes).
We successfully used **Wireless Debugging pairing** instead of forcing classic tcpip mode.

If you see:

- `error: closed`
- `device offline`
- `more than one device/emulator`

✅ Fix:

- Disconnect old entries:

```bash
adb disconnect <old_host:port>
```

- Then use only one connection, and always target it via `-s`.

---

## ⚡ Quick One-Liner Checks

### ✅ Confirm host + reader detected

```bash
adb -s 192.168.1.22:38967 shell dumpsys usb | findstr /i "host_connected current_mode data_role vendor_id product_id EMV"
```

---

## ✅ Current Status

- ✅ Tablet can become USB host (DFP / OTG)
- ✅ External reader is detected (VID/PID + product name)
- ✅ `lsusb` shows `2ce3:9567`
- ✅ ADB works over Wi-Fi while reader occupies USB-C

---

## 🚀 Next Step (Implementation Plan)

Now that the OS detects the reader, the next step is **reading a card**:

### Options (we’ll choose based on what this reader exposes):

- 🧠 **CCID / Smartcard interface** (APDU reads)
- 📶 **Contactless NFC interface** (may expose as CCID, HID, or vendor protocol)
- 📲 Android app integration via:

  - `UsbManager` + `UsbDevice` detection
  - claim interface + bulk endpoints
  - or use a library if it’s standard CCID

✅ We already confirmed the device shows up as:

- `EMV Smartcard Reader`
- `Contactless Card Reader`

So the tablet can “see” it — now we need to implement the transport and read flow.

---

## 🧷 Notes / Constraints

- 📌 The tablet has **only one USB-C port**
- ✅ Therefore we must use:

  - **Wireless ADB debugging**
  - or an **OTG hub** (later) if simultaneous charge is needed

- 🔋 Battery must be sufficient while testing without a hub

---

## 🧠 Tip

If Android pops up a permission prompt like:

> “Open AGPay to handle this USB device?”

✅ Select AGPay and “Always allow” — this is the cleanest path for USB integration.

---

## 🏁 Repo Purpose

This repo is the **no-NFC tablet variant** where we:

- keep the AGPay core app stable ✅
- and implement USB reader support without touching the working Terminal phone build.

---

## 📌 Helpful Debug Commands (Copy/Paste)

```bash
adb devices

adb -s 192.168.1.22:38967 shell dumpsys usb | findstr /i "host_connected current_mode data_role power_role"
adb -s 192.168.1.22:38967 shell dumpsys usb | findstr /i "vendor_id product_id product_name EMV Smartcard Reader"

adb -s 192.168.1.22:38967 shell lsusb
adb -s 192.168.1.22:38967 shell ls -la /dev/bus/usb
```

---

## 🧾 License / Ownership

AGPay © Alba Gold Systems. Internal engineering notes for device compatibility testing.

```

```
