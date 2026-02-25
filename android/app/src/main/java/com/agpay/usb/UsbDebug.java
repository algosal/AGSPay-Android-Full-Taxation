package com.agpay.usb;

import android.hardware.usb.*;
import android.util.Log;

public class UsbDebug {
  public static final String TAG = "AGPAY_USB";

  public static void openAndLog(UsbManager usbManager, UsbDevice device) {
    UsbDeviceConnection conn = null;
    try {
      conn = usbManager.openDevice(device);
      if (conn == null) {
        Log.e(TAG, "openDevice returned null (no permission or failed).");
        return;
      }

      Log.d(TAG, "OPEN OK: " + device.getDeviceName()
          + " interfaces=" + device.getInterfaceCount());

      for (int i = 0; i < device.getInterfaceCount(); i++) {
        UsbInterface intf = device.getInterface(i);
        Log.d(TAG, "IF[" + i + "]: class=" + intf.getInterfaceClass()
            + " sub=" + intf.getInterfaceSubclass()
            + " proto=" + intf.getInterfaceProtocol()
            + " endpoints=" + intf.getEndpointCount());

        for (int e = 0; e < intf.getEndpointCount(); e++) {
          UsbEndpoint ep = intf.getEndpoint(e);
          Log.d(TAG, "  EP[" + e + "]: type=" + ep.getType()
              + " dir=" + (ep.getDirection() == UsbConstants.USB_DIR_IN ? "IN" : "OUT")
              + " addr=" + ep.getAddress()
              + " maxPkt=" + ep.getMaxPacketSize());
        }
      }

    } catch (Exception ex) {
      Log.e(TAG, "openAndLog error: " + ex.getMessage(), ex);
    } finally {
      if (conn != null) conn.close();
    }
  }
}
