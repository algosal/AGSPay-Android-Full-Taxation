// FILE: android/app/src/main/java/com/agpay/usb/UsbReceiver.java
// Purpose:
// - Receive USB attach event
// - Request permission
// - Receive permission result (explicit broadcast) and dump interfaces/endpoints

package com.agpay.usb;

import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.hardware.usb.UsbDevice;
import android.hardware.usb.UsbManager;
import android.os.Build;
import android.util.Log;

public class UsbReceiver extends BroadcastReceiver {
  public static final String TAG = "AGPAY_USB";
  public static final String ACTION_USB_PERMISSION = "com.agpay.USB_PERMISSION";

  @Override
  public void onReceive(Context context, Intent intent) {
    String action = intent.getAction();
    UsbManager usbManager = (UsbManager) context.getSystemService(Context.USB_SERVICE);
    if (usbManager == null) return;

    Log.d(TAG, "onReceive action=" + action);

    if (UsbManager.ACTION_USB_DEVICE_ATTACHED.equals(action)) {
      UsbDevice device = intent.getParcelableExtra(UsbManager.EXTRA_DEVICE);
      if (device == null) {
        Log.d(TAG, "USB_DEVICE_ATTACHED but EXTRA_DEVICE was null");
        return;
      }

      Log.d(TAG, "USB ATTACHED: vid=" + device.getVendorId()
          + " pid=" + device.getProductId()
          + " name=" + device.getDeviceName()
          + " product=" + device.getProductName());

      requestPermission(context, usbManager, device);
      return;
    }

    if (ACTION_USB_PERMISSION.equals(action)) {
      UsbDevice device = intent.getParcelableExtra(UsbManager.EXTRA_DEVICE);
      boolean granted = intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false);

      Log.d(TAG, "USB PERMISSION: granted=" + granted
          + " device=" + (device != null ? device.getDeviceName() : "null"));

      if (granted && device != null) {
        UsbDebug.openAndLog(usbManager, device);
      }
    }
  }

  private void requestPermission(Context context, UsbManager usbManager, UsbDevice device) {
    if (usbManager.hasPermission(device)) {
      Log.d(TAG, "Already has permission. Opening now...");
      UsbDebug.openAndLog(usbManager, device);
      return;
    }

    Intent permIntent = new Intent(ACTION_USB_PERMISSION);

    // ✅ Make it explicit so the permission result ALWAYS returns to this receiver
    permIntent.setClass(context, UsbReceiver.class);

    int flags = 0;
    if (Build.VERSION.SDK_INT >= 31) {
      flags = PendingIntent.FLAG_MUTABLE;
    } else if (Build.VERSION.SDK_INT >= 23) {
      flags = PendingIntent.FLAG_IMMUTABLE;
    }

    PendingIntent pi = PendingIntent.getBroadcast(context, 0, permIntent, flags);
    usbManager.requestPermission(device, pi);

    Log.d(TAG, "Requested permission for " + device.getDeviceName());
  }
}
