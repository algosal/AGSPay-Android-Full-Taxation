// TerminalContainer to render your TerminalScreen with the provider props
import React, {useContext} from 'react';
import TerminalScreen from './TerminalScreen.jsx';
import {TerminalContext} from './TerminalProvider.jsx';

export default function TerminalContainer(props) {
  const term = useContext(TerminalContext);

  return (
    <TerminalScreen
      {...props}
      onConnectReader={term?.onConnectReader}
      onDisconnectReader={term?.onDisconnectReader}
      readerStatus={term?.readerStatus}
      isReaderBusy={term?.isReaderBusy}
      terminalStatusLine={term?.terminalStatusLine}
    />
  );
}
