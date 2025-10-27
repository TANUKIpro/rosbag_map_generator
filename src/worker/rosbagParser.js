/**
 * Rosbagファイルを解析してトピック一覧を取得
 */
export async function parseRosbagTopics(file) {
  console.log('[rosbagParser] ========== parseRosbagTopics START ==========');
  console.log('[rosbagParser] ファイル名:', file.name);
  console.log('[rosbagParser] ファイルサイズ:', (file.size / 1024 / 1024).toFixed(2), 'MB');

  try {
    const maxReadSize = Math.min(file.size, 10 * 1024 * 1024);
    const blob = file.slice(0, maxReadSize);
    const arrayBuffer = await blob.arrayBuffer();
    const dataView = new DataView(arrayBuffer);

    const magicBytes = new Uint8Array(arrayBuffer, 0, Math.min(13, arrayBuffer.byteLength));
    const magic = new TextDecoder().decode(magicBytes);

    if (!magic.startsWith('#ROSBAG V2.0')) {
      console.warn('[rosbagParser] ⚠️ ROSバッグv2.0のマジックナンバーがありません');
    }

    let headerStart = magic.startsWith('#ROSBAG V2.0') ? 13 : 0;
    console.log('[rosbagParser] バッグヘッダー開始位置:', headerStart);
    
    const header = readBagHeader(dataView, headerStart);
    console.log('[rosbagParser] 次のレコード開始位置:', header.nextOffset);

    const indexPosField = header.fields.get('index_pos');
    let indexPos = null;
    if (indexPosField && indexPosField.length >= 8) {
      const indexPosView = new DataView(indexPosField.buffer, indexPosField.byteOffset, indexPosField.byteLength);
      indexPos = Number(indexPosView.getBigUint64(0, true));
      console.log('[rosbagParser] インデックス位置:', indexPos);
    }

    const connections = new Map();
    const topics = new Map();

    // ステップ1: INDEXセクション以降のCONNECTION情報を読み取る
    if (indexPos !== null && indexPos < arrayBuffer.byteLength) {
      console.log('[rosbagParser] ステップ1: INDEXセクション以降を読み取り中...');
      let offset = indexPos;
      let recordCount = 0;
      const maxRecords = 1000;

      while (offset < arrayBuffer.byteLength && recordCount < maxRecords) {
        try {
          const record = readRecord(dataView, offset);
          if (!record) break;

          const op = record.header.fields.get('op')?.[0];

          if (op === 0x07) {
            const conn = record.header.fields.get('conn');
            const topic = record.header.fields.get('topic');
            const type = record.header.fields.get('type');

            if (conn && topic && type) {
              const connId = new DataView(conn.buffer, conn.byteOffset, conn.byteLength).getUint32(0, true);
              const topicStr = new TextDecoder().decode(topic);
              const typeStr = new TextDecoder().decode(type);

              connections.set(connId, { topic: topicStr, type: typeStr });
              if (!topics.has(topicStr)) {
                topics.set(topicStr, { type: typeStr, messageCount: 0 });
              }
              console.log('[rosbagParser] CONNECTION:', connId, '→', topicStr, '(', typeStr, ')');
            }
          }

          if (op === 0x06) {
            const count = record.header.fields.get('count');
            const conn = record.header.fields.get('conn');

            if (count && conn && count.length >= 4 && conn.length >= 4) {
              const connId = new DataView(conn.buffer, conn.byteOffset, conn.byteLength).getUint32(0, true);
              const messageCount = new DataView(count.buffer, count.byteOffset, count.byteLength).getUint32(0, true);

              const connection = connections.get(connId);
              if (connection) {
                const topicData = topics.get(connection.topic);
                if (topicData) {
                  topicData.messageCount += messageCount;
                }
              }
            }
          }

          offset = record.nextOffset;
          recordCount++;
        } catch (e) {
          console.warn('[rosbagParser] レコード読み取りエラー:', e.message);
          break;
        }
      }
    }

    if (connections.size === 0) {
      console.log('[rosbagParser] ステップ2: ファイル先頭からもCONNECTION情報を検索中...');
      let offset = header.nextOffset;
      let recordCount = 0;
      const maxRecords = 100;

      while (offset < arrayBuffer.byteLength && recordCount < maxRecords) {
        try {
          const record = readRecord(dataView, offset);
          if (!record) break;

          const op = record.header.fields.get('op')?.[0];

          if (op === 0x07) {
            const conn = record.header.fields.get('conn');
            const topic = record.header.fields.get('topic');
            const type = record.header.fields.get('type');

            if (conn && topic && type) {
              const connId = new DataView(conn.buffer, conn.byteOffset, conn.byteLength).getUint32(0, true);
              const topicStr = new TextDecoder().decode(topic);
              const typeStr = new TextDecoder().decode(type);

              connections.set(connId, { topic: topicStr, type: typeStr });
              if (!topics.has(topicStr)) {
                topics.set(topicStr, { type: typeStr, messageCount: 0 });
              }
            }
          }

          if (op === 0x05) break;

          offset = record.nextOffset;
          recordCount++;
        } catch (e) {
          console.warn('[rosbagParser] レコード読み取りエラー:', e.message);
          break;
        }
      }
    }

    console.log('[rosbagParser] ========== 検出結果 ==========');
    console.log('[rosbagParser] CONNECTION数:', connections.size);
    console.log('[rosbagParser] トピック数:', topics.size);

    const topicList = Array.from(topics.entries()).map(([name, data]) => ({
      name,
      type: data.type,
      messageCount: data.messageCount
    }));

    topicList.forEach(topic => {
      console.log('[rosbagParser]   -', topic.name, '(', topic.type, ') -', topic.messageCount, 'messages');
    });

    if (topicList.length === 0) {
      console.warn('[rosbagParser] ⚠️ トピックが見つかりませんでした');
    }

    console.log('[rosbagParser] ========== parseRosbagTopics END ==========');
    return topicList;
  } catch (error) {
    console.error('[rosbagParser] ❌ エラー:', error);
    throw error;
  }
}

/**
 * Rosbagファイルから指定トピックのメッセージを抽出
 */
export async function extractMessages(file, topicName) {
  console.log('[extractMessages] ========== メッセージ抽出開始 ==========');
  console.log('[extractMessages] トピック:', topicName);

  try {
    const arrayBuffer = await file.arrayBuffer();
    const dataView = new DataView(arrayBuffer);

    const magicBytes = new Uint8Array(arrayBuffer, 0, 13);
    const magic = new TextDecoder().decode(magicBytes);

    if (!magic.startsWith('#ROSBAG V2.0')) {
      throw new Error('無効なROSバッグファイル形式');
    }

    console.log('[extractMessages] バッグヘッダー読み取り中...');
    const header = readBagHeader(dataView, 13);
    console.log('[extractMessages] 次のレコード開始位置:', header.nextOffset);

    const indexPosField = header.fields.get('index_pos');
    let indexPos = null;
    if (indexPosField && indexPosField.length >= 8) {
      const indexPosView = new DataView(indexPosField.buffer, indexPosField.byteOffset, indexPosField.byteLength);
      indexPos = Number(indexPosView.getBigUint64(0, true));
      console.log('[extractMessages] インデックス位置:', indexPos);
    }

    const connections = new Map();

    // ステップ1: INDEXセクション以降のCONNECTION情報を読み取る
    if (indexPos !== null && indexPos < arrayBuffer.byteLength) {
      console.log('[extractMessages] ステップ1: INDEXセクション以降のCONNECTION情報を読み取り...');
      let offset = indexPos;
      let recordCount = 0;
      const maxRecords = 1000;

      while (offset < arrayBuffer.byteLength && recordCount < maxRecords) {
        try {
          const record = readRecord(dataView, offset);
          if (!record) break;

          const op = record.header.fields.get('op')?.[0];

          if (op === 0x07) {
            const conn = record.header.fields.get('conn');
            const topic = record.header.fields.get('topic');
            const type = record.header.fields.get('type');

            if (conn && topic && type) {
              const connId = new DataView(conn.buffer, conn.byteOffset, conn.byteLength).getUint32(0, true);
              const topicStr = new TextDecoder().decode(topic);
              const typeStr = new TextDecoder().decode(type);

              connections.set(connId, { topic: topicStr, type: typeStr });
              console.log('[extractMessages] CONNECTION:', connId, '→', topicStr);
            }
          }

          offset = record.nextOffset;
          recordCount++;
        } catch (e) {
          console.warn('[extractMessages] INDEXスキャンエラー:', e.message);
          break;
        }
      }
    }

    if (connections.size === 0) {
      console.log('[extractMessages] ステップ2: ファイル先頭からCONNECTION情報を読み取り...');
      let offset = header.nextOffset;
      let recordCount = 0;
      const maxRecords = 100;

      while (offset < arrayBuffer.byteLength && recordCount < maxRecords) {
        try {
          const record = readRecord(dataView, offset);
          if (!record) break;

          const op = record.header.fields.get('op')?.[0];

          if (op === 0x07) {
            const conn = record.header.fields.get('conn');
            const topic = record.header.fields.get('topic');
            const type = record.header.fields.get('type');

            if (conn && topic && type) {
              const connId = new DataView(conn.buffer, conn.byteOffset, conn.byteLength).getUint32(0, true);
              const topicStr = new TextDecoder().decode(topic);
              const typeStr = new TextDecoder().decode(type);

              connections.set(connId, { topic: topicStr, type: typeStr });
              console.log('[extractMessages] CONNECTION:', connId, '→', topicStr);
            }
          }

          if (op === 0x05) break;

          offset = record.nextOffset;
          recordCount++;
        } catch (e) {
          console.warn('[extractMessages] ヘッダースキャンエラー:', e.message);
          break;
        }
      }
    }

    console.log('[extractMessages] 合計CONNECTION数:', connections.size);

    // ステップ3: 対象トピックのconnection IDを検索
    let targetConnId = null;
    for (const [connId, info] of connections.entries()) {
      if (info.topic === topicName) {
        targetConnId = connId;
        console.log('[extractMessages] ✅ 対象トピック見つかりました!');
        console.log('[extractMessages]   Connection ID:', connId);
        console.log('[extractMessages]   Type:', info.type);
        break;
      }
    }

    if (targetConnId === null) {
      console.error('[extractMessages] ❌ トピックが見つかりません:', topicName);
      console.log('[extractMessages] 利用可能なトピック:');
      for (const [connId, info] of connections.entries()) {
        console.log('[extractMessages]   -', info.topic);
      }
      return [];
    }

    // ステップ4: CHUNKをスキャンしてメッセージを抽出
    const messages = [];
    let offset = header.nextOffset;
    const scanEnd = indexPos !== null ? indexPos : arrayBuffer.byteLength;

    console.log('[extractMessages] ステップ4: CHUNKスキャン開始...');
    console.log('[extractMessages]   開始:', offset, '終了:', scanEnd);

    let chunkCount = 0;

    while (offset < scanEnd) {
      try {
        if (offset + 4 > arrayBuffer.byteLength) break;

        const headerLen = dataView.getUint32(offset, true);

        if (headerLen === 0 || headerLen > 1024 * 1024) {
          break;
        }

        if (offset + 4 + headerLen + 4 > arrayBuffer.byteLength) break;

        const headerFields = readHeaderFields(dataView, offset + 4, headerLen);
        const op = headerFields.fields.get('op')?.[0];

        if (op === 0x05) {
          chunkCount++;
          console.log('[extractMessages] CHUNK #' + chunkCount, '@ offset', offset);

          const chunkMessages = extractMessagesFromChunk(dataView, offset, targetConnId);
          console.log('[extractMessages] → 抽出:', chunkMessages.length, '件');
          messages.push(...chunkMessages);
        }

        const dataLen = dataView.getUint32(offset + 4 + headerLen, true);
        offset += 4 + headerLen + 4 + dataLen;
      } catch (e) {
        console.warn('[extractMessages] レコード読み取りエラー:', e.message);
        break;
      }
    }

    console.log('[extractMessages] ========== 抽出完了 ==========');
    console.log('[extractMessages] CHUNK数:', chunkCount);
    console.log('[extractMessages] メッセージ数:', messages.length);

    if (messages.length === 0) {
      console.error('[extractMessages] ⚠️ メッセージが抽出できませんでした');
    } else {
      console.log('[extractMessages] ✅ 抽出成功!');
    }

    return messages;
  } catch (error) {
    console.error('[extractMessages] ❌ エラー:', error);
    throw error;
  }
}

/**
 * CHUNKレコードからメッセージを抽出
 */
function extractMessagesFromChunk(dataView, chunkOffset, targetConnId) {
  const messages = [];

  try {
    const headerLen = dataView.getUint32(chunkOffset, true);
    const headerFields = readHeaderFields(dataView, chunkOffset + 4, headerLen);

    const dataLenOffset = chunkOffset + 4 + headerLen;
    const dataLen = dataView.getUint32(dataLenOffset, true);
    const dataOffset = dataLenOffset + 4;

    const compression = headerFields.fields.get('compression');
    const compressionStr = compression ? new TextDecoder().decode(compression) : 'none';

    if (compressionStr !== 'none') {
      console.warn('[extractMessagesFromChunk] ⚠️ 圧縮CHUNK:', compressionStr);
      return messages;
    }

    let offset = dataOffset;
    const chunkEnd = dataOffset + dataLen;
    let messageCount = 0;
    let matchedCount = 0;

    while (offset < chunkEnd && offset < dataView.byteLength) {
      try {
        if (offset + 4 > dataView.byteLength) break;

        const msgHeaderLen = dataView.getUint32(offset, true);
        offset += 4;

        if (offset + msgHeaderLen > dataView.byteLength) break;

        const msgHeader = readHeaderFields(dataView, offset, msgHeaderLen);
        offset += msgHeaderLen;

        if (offset + 4 > dataView.byteLength) break;

        const msgDataLen = dataView.getUint32(offset, true);
        offset += 4;

        if (offset + msgDataLen > dataView.byteLength) break;

        const op = msgHeader.fields.get('op')?.[0];

        if (op === 0x02) {
          messageCount++;
          const conn = msgHeader.fields.get('conn');

          if (conn) {
            const connId = new DataView(conn.buffer, conn.byteOffset, conn.byteLength).getUint32(0, true);

            if (connId === targetConnId) {
              matchedCount++;
              const messageData = new Uint8Array(dataView.buffer, offset, msgDataLen);

              const time = msgHeader.fields.get('time');
              let timestamp = 0;
              if (time && time.length >= 8) {
                const timeView = new DataView(time.buffer, time.byteOffset, time.byteLength);
                const sec = timeView.getUint32(0, true);
                const nsec = timeView.getUint32(4, true);
                timestamp = sec + nsec / 1e9;
              }

              messages.push({
                timestamp: timestamp,
                data: messageData
              });
            }
          }
        }

        offset += msgDataLen;
      } catch (e) {
        console.warn('[extractMessagesFromChunk] メッセージ読み取りエラー:', e.message);
        break;
      }
    }

    console.log('[extractMessagesFromChunk]   総メッセージ:', messageCount, '/ マッチ:', matchedCount);
  } catch (e) {
    console.warn('[extractMessagesFromChunk] エラー:', e.message);
  }

  return messages;
}

/**
 * LaserScanメッセージをデコード
 */
export function decodeLaserScan(data) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let offset = 0;

  const seq = view.getUint32(offset, true);
  offset += 4;

  const stampSec = view.getUint32(offset, true);
  offset += 4;
  const stampNsec = view.getUint32(offset, true);
  offset += 4;

  const frameIdLen = view.getUint32(offset, true);
  offset += 4;
  const frameId = new TextDecoder().decode(new Uint8Array(data.buffer, data.byteOffset + offset, frameIdLen));
  offset += frameIdLen;

  const angle_min = view.getFloat32(offset, true);
  offset += 4;

  const angle_max = view.getFloat32(offset, true);
  offset += 4;

  const angle_increment = view.getFloat32(offset, true);
  offset += 4;

  const time_increment = view.getFloat32(offset, true);
  offset += 4;

  const scan_time = view.getFloat32(offset, true);
  offset += 4;

  const range_min = view.getFloat32(offset, true);
  offset += 4;

  const range_max = view.getFloat32(offset, true);
  offset += 4;

  const rangesLen = view.getUint32(offset, true);
  offset += 4;
  const ranges = new Float32Array(rangesLen);
  for (let i = 0; i < rangesLen; i++) {
    ranges[i] = view.getFloat32(offset, true);
    offset += 4;
  }

  const intensitiesLen = view.getUint32(offset, true);
  offset += 4;
  const intensities = new Float32Array(intensitiesLen);
  for (let i = 0; i < intensitiesLen; i++) {
    intensities[i] = view.getFloat32(offset, true);
    offset += 4;
  }

  return {
    seq,
    stamp: stampSec + stampNsec / 1e9,
    frame_id: frameId,
    angle_min,
    angle_max,
    angle_increment,
    time_increment,
    scan_time,
    range_min,
    range_max,
    ranges,
    intensities
  };
}

// ========== ユーティリティ関数 ==========

/**
 * ★修正版: バッグヘッダーを読み取る（データ部分も正しくスキップ）
 */
function readBagHeader(dataView, offset) {
  if (offset + 4 > dataView.byteLength) {
    throw new Error(`ヘッダー読み取り不可: offset ${offset}`);
  }

  const headerLen = dataView.getUint32(offset, true);

  if (headerLen > dataView.byteLength || headerLen > 1024 * 1024) {
    throw new Error(`無効なヘッダー長: ${headerLen}`);
  }

  offset += 4;

  const fields = new Map();
  let headerOffset = 0;

  while (headerOffset < headerLen) {
    if (offset + headerOffset + 4 > dataView.byteLength) break;

    const fieldLen = dataView.getUint32(offset + headerOffset, true);
    headerOffset += 4;

    if (fieldLen === 0) break;
    if (fieldLen > headerLen || fieldLen > 1024 * 1024) break;
    if (offset + headerOffset + fieldLen > dataView.byteLength) break;

    const fieldData = new Uint8Array(dataView.buffer, offset + headerOffset, fieldLen);
    headerOffset += fieldLen;

    const equalPos = fieldData.indexOf(0x3d);
    if (equalPos !== -1) {
      const key = new TextDecoder().decode(fieldData.subarray(0, equalPos));
      const value = fieldData.subarray(equalPos + 1);
      fields.set(key, value);
    }
  }

  offset += headerLen;

  // ★重要: バッグヘッダーのデータ部分をスキップ
  if (offset + 4 <= dataView.byteLength) {
    const dataLen = dataView.getUint32(offset, true);
    offset += 4 + dataLen;
  }

  return {
    fields,
    nextOffset: offset
  };
}

function readRecord(dataView, offset) {
  if (offset + 8 > dataView.byteLength) return null;

  const headerLen = dataView.getUint32(offset, true);
  offset += 4;

  if (offset + headerLen + 4 > dataView.byteLength) return null;

  const header = readHeaderFields(dataView, offset, headerLen);
  offset += headerLen;

  const dataLen = dataView.getUint32(offset, true);
  offset += 4;

  if (offset + dataLen > dataView.byteLength) return null;

  const op = header.fields.get('op')?.[0];
  if (op === 0x07 && dataLen > 0) {
    try {
      const dataFields = readHeaderFields(dataView, offset, dataLen);
      for (const [key, value] of dataFields.fields.entries()) {
        if (!header.fields.has(key)) {
          header.fields.set(key, value);
        }
      }
    } catch (e) {
      console.warn('[readRecord] CONNECTIONデータ解析エラー:', e.message);
    }
  }

  offset += dataLen;

  return {
    header,
    nextOffset: offset
  };
}

function readHeaderFields(dataView, offset, length) {
  const fields = new Map();
  let headerOffset = 0;

  while (headerOffset < length) {
    if (offset + headerOffset + 4 > dataView.byteLength) break;

    const fieldLen = dataView.getUint32(offset + headerOffset, true);
    headerOffset += 4;

    if (fieldLen === 0 || offset + headerOffset + fieldLen > dataView.byteLength) break;

    try {
      const fieldData = new Uint8Array(dataView.buffer, offset + headerOffset, fieldLen);
      headerOffset += fieldLen;

      const equalPos = fieldData.indexOf(0x3d);
      if (equalPos !== -1) {
        const key = new TextDecoder().decode(fieldData.subarray(0, equalPos));
        const value = fieldData.subarray(equalPos + 1);
        fields.set(key, value);
      }
    } catch (e) {
      console.warn('[readHeaderFields] フィールド読み取りエラー:', e.message);
      break;
    }
  }

  return { fields };
}