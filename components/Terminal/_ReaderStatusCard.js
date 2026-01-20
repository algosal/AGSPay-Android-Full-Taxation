// components/Terminal/_ReaderStatusCard.jsx
import React, {useMemo} from 'react';
import {View, Text, TouchableOpacity} from 'react-native';
import styles, {AG} from './terminal.styles';

function normalizeStatus(status) {
  // Accepts string or object, stays defensive.
  if (!status) return {state: 'unknown'};
  if (typeof status === 'string') return {state: status};
  if (typeof status === 'object') return status;
  return {state: 'unknown'};
}

export default function ReaderStatusCard({status, onConnect}) {
  const s = useMemo(() => normalizeStatus(status), [status]);

  // You can pass any of these from your existing logic:
  // status = { state: 'connected'|'connecting'|'disconnected'|'error', name?: 'BBPOS...', message?: '...' }
  const state = (s.state || 'unknown').toLowerCase();
  const name = s.name || s.readerName || s.label || '';
  const message = s.message || s.error || '';

  const ui = useMemo(() => {
    switch (state) {
      case 'connected':
        return {
          title: 'Reader Connected',
          detail: name ? name : 'Ready',
          badge: 'CONNECTED',
          badgeColor: AG.gold,
          badgeTextColor: AG.goldText,
          showConnect: true,
          connectText: 'Reconnect Reader',
        };
      case 'connecting':
        return {
          title: 'Connecting…',
          detail: 'Please wait',
          badge: 'CONNECTING',
          badgeColor: '#334155',
          badgeTextColor: AG.text,
          showConnect: false,
          connectText: 'Connect Reader',
        };
      case 'disconnected':
      case 'not_connected':
      case 'notconnected':
        return {
          title: 'Reader Disconnected',
          detail: 'Tap to connect',
          badge: 'OFFLINE',
          badgeColor: '#334155',
          badgeTextColor: AG.text,
          showConnect: true,
          connectText: 'Connect Reader',
        };
      case 'error':
        return {
          title: 'Reader Error',
          detail: message ? message : 'Tap to reconnect',
          badge: 'ERROR',
          badgeColor: AG.danger,
          badgeTextColor: AG.text,
          showConnect: true,
          connectText: 'Connect Reader',
        };
      default:
        return {
          title: 'Reader Status',
          detail: 'Tap to connect',
          badge: 'UNKNOWN',
          badgeColor: '#334155',
          badgeTextColor: AG.text,
          showConnect: true,
          connectText: 'Connect Reader',
        };
    }
  }, [state, name, message]);

  return (
    <View style={{marginTop: 8}}>
      <View
        style={{
          backgroundColor: AG.inputBg,
          borderWidth: 1,
          borderColor: AG.border,
          borderRadius: 16,
          padding: 12,
        }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
          <View style={{flex: 1, paddingRight: 10}}>
            <Text style={{color: AG.text, fontSize: 14, fontWeight: '900'}}>
              {ui.title}
            </Text>
            <Text
              style={{
                color: AG.muted,
                marginTop: 2,
                fontSize: 12,
                fontWeight: '800',
              }}>
              {ui.detail}
            </Text>
          </View>

          <View
            style={{
              paddingVertical: 6,
              paddingHorizontal: 10,
              borderRadius: 999,
              backgroundColor: ui.badgeColor,
            }}>
            <Text
              style={{
                color: ui.badgeTextColor,
                fontSize: 11,
                fontWeight: '900',
              }}>
              {ui.badge}
            </Text>
          </View>
        </View>

        {ui.showConnect ? (
          <TouchableOpacity
            onPress={onConnect}
            style={{
              marginTop: 10,
              paddingVertical: 12,
              borderRadius: 14,
              backgroundColor: AG.gold,
            }}>
            <Text
              style={{
                color: AG.goldText,
                fontSize: 15,
                fontWeight: '900',
                textAlign: 'center',
              }}>
              {ui.connectText}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}
