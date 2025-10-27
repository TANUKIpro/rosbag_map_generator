/**
 * 簡易的なRosbagパーサー
 *
 * Rosbagファイルからトピック一覧を抽出し、メッセージデータを読み取る
 */

/**
 * Rosbagファイルを解析してトピック一覧を取得
 * 大きなファイルに対応するため、チャンク単位で読み込む
 *
 * @param {File} file - Rosbagファイル
 * @returns {Promise<Array>} トピック一覧 [{name, type, messageCount}]
 */
export async function parseRosbagTopics(file) {
  console.log('[rosbagParser] Starting to parse rosbag file:', file.name);
  console.log('[rosbagParser] File size:', file.size, 'bytes (', (file.size / 1024 / 1024).toFixed(2), 'MB)');

  try {
    // 大きなファイルの場合は最初の部分だけを読み込む（最大10MB）
    const maxReadSize = Math.min(file.size, 10 * 1024 * 1024); // 10MB

    const blob = file.slice(0, maxReadSize);
    const arrayBuffer = await blob.arrayBuffer();
    const dataView = new DataView(arrayBuffer);

    // Rosbag v2.0 のマジックナンバーをチェック
    const magicBytes = new Uint8Array(arrayBuffer, 0, Math.min(13, arrayBuffer.byteLength));
    const magic = new TextDecoder().decode(magicBytes);

    if (!magic.startsWith('#ROSBAG V2.0')) {
      console.warn('[rosbagParser] Warning: File does not start with expected magic string "#ROSBAG V2.0"');
      console.warn('[rosbagParser] Detected:', magic);
    }

    // マジックナンバーの後にある実際のヘッダー開始位置を探す
    let headerStart = 13; // "#ROSBAG V2.0\n" = 13 bytes
    if (!magic.startsWith('#ROSBAG V2.0')) {
      // マジックナンバーがない場合は、最初からヘッダーと仮定
      headerStart = 0;
    }

    // Rosbagヘッダーのチェック
    const header = readHeader(dataView, headerStart);

    if (!header.fields.has('op')) {
      console.warn('[rosbagParser] Warning: No "op" field in bag header');
      console.warn('[rosbagParser] Available fields:', Array.from(header.fields.keys()));
    } else {
      const op = header.fields.get('op')[0];
      if (op !== 0x03) {
        console.warn('[rosbagParser] Warning: Expected op=0x03 (BAG_HEADER), got:', op);
      }
    }

    // index_pos を取得（インデックスセクションの位置）
    const indexPosField = header.fields.get('index_pos');
    let indexPos = null;
    if (indexPosField && indexPosField.length >= 8) {
      // 8バイトのuint64として読み取る（下位4バイトのみ使用）
      const indexPosView = new DataView(indexPosField.buffer, indexPosField.byteOffset, indexPosField.byteLength);
      indexPos = Number(indexPosView.getBigUint64(0, true));
    }

    // トピック情報を格納
    const connections = new Map(); // connection_id -> {topic, type}
    const topics = new Map(); // topic_name -> {type, messageCount}
    let totalRecordCount = 0; // 処理したレコード数の合計

    // ステップ1: ファイルの先頭部分からCONNECTIONレコードを読み取る
    // CONNECTIONレコードは通常CHUNKの直前に配置される
    {
      let offset = header.nextOffset;
      let recordCount = 0;
      const maxRecords = 100; // 最初の100レコードをスキャン

      while (offset < arrayBuffer.byteLength && recordCount < maxRecords) {
        try {
          const record = readRecord(dataView, offset);
          if (!record) break;

          const op = record.header.fields.get('op')?.[0];

          // CONNECTION レコード (op=0x07) を探す
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

          // CHUNKに到達したら、CONNECTIONレコードは終わり
          if (op === 0x05) {
            break;
          }

          offset = record.nextOffset;
          recordCount++;
        } catch (e) {
          console.warn('[rosbagParser] Error in start scan:', e.message);
          break;
        }
      }
    }

    // ステップ2: インデックスセクションからCHUNK_INFOとCONNECTIONを読み取る
    if (indexPos !== null && indexPos < arrayBuffer.byteLength) {
      let offset = indexPos;
      let recordCount = 0;
      const maxRecords = 1000; // インデックスセクションのレコード数制限

      while (offset < arrayBuffer.byteLength && recordCount < maxRecords) {
        try {
          const record = readRecord(dataView, offset);

          if (!record) {
            break;
          }

          const op = record.header.fields.get('op')?.[0];

          // Connection レコード (op=0x07)
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

          // CHUNK_INFO レコード (op=0x06) - メッセージ数をカウント
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
          console.warn('[rosbagParser] Error reading index record at offset', offset, ':', e.message);
          break;
        }
      }

      totalRecordCount = recordCount;
    } else {
      console.warn('[rosbagParser] No index_pos found or invalid, falling back to sequential scan');

      // フォールバック: 先頭から順次スキャン（古い実装）
      let offset = header.nextOffset;
      let recordCount = 0;
      const maxRecords = 5000;

      while (offset < arrayBuffer.byteLength && recordCount < maxRecords) {
      try {
        const record = readRecord(dataView, offset);

        if (!record) {
          console.log('[rosbagParser] Reached end of valid records at offset:', offset);
          break;
        }

        const op = record.header.fields.get('op')?.[0];

        // Connection レコード (op=0x07)
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

            console.log('[rosbagParser] Found connection:', connId, topicStr, typeStr);
          }
        }

        // Message Data レコード (op=0x02)
        if (op === 0x02) {
          const conn = record.header.fields.get('conn');
          if (conn) {
            const connId = new DataView(conn.buffer, conn.byteOffset, conn.byteLength).getUint32(0, true);
            const connection = connections.get(connId);
            if (connection) {
              const topicData = topics.get(connection.topic);
              if (topicData) {
                topicData.messageCount++;
              }
            }
          }
        }

          offset = record.nextOffset;
          recordCount++;

          // 進捗ログ（500レコードごと）
          if (recordCount % 500 === 0) {
            console.log(`[rosbagParser] Processed ${recordCount} records, offset: ${offset}/${arrayBuffer.byteLength}`);
          }

          // すべてのトピックが見つかったら早期終了
          if (connections.size > 0 && recordCount > 1000) {
            console.log('[rosbagParser] Topic detection likely complete, stopping early');
            break;
          }
        } catch (e) {
          console.warn('[rosbagParser] Error reading record at offset', offset, ':', e.message);
          break;
        }
      }

      totalRecordCount = recordCount;
    }

    console.log('[rosbagParser] Found', connections.size, 'connections and', topics.size, 'unique topics');

    // Map を配列に変換
    const topicList = Array.from(topics.entries()).map(([name, data]) => ({
      name,
      type: data.type,
      messageCount: data.messageCount
    }));

    // トピックが見つからなかった場合の警告
    if (topicList.length === 0) {
      console.warn('[rosbagParser] No topics found. File may not be a valid rosbag or may need larger chunk size.');
    }

    return topicList;
  } catch (error) {
    console.error('[rosbagParser] Error parsing rosbag:', error);
    throw error;
  }
}

/**
 * Rosbagファイルから指定トピックのメッセージを抽出
 * @param {File} file - Rosbagファイル
 * @param {string} topicName - 抽出するトピック名 (例: '/base_scan')
 * @returns {Promise<Array>} メッセージデータの配列
 */
export async function extractMessages(file, topicName) {
  console.log('[rosbagParser] Extracting messages for topic:', topicName);

  try {
    // ファイル全体を読み込む
    const arrayBuffer = await file.arrayBuffer();
    const dataView = new DataView(arrayBuffer);

    // マジックナンバーチェック
    const magicBytes = new Uint8Array(arrayBuffer, 0, 13);
    const magic = new TextDecoder().decode(magicBytes);

    if (!magic.startsWith('#ROSBAG V2.0')) {
      throw new Error('Invalid rosbag file format');
    }

    // ヘッダーを読み取る
    const header = readHeader(dataView, 13);

    // ステップ1: CONNECTION情報を収集
    const connections = new Map(); // connection_id -> {topic, type}
    let offset = header.nextOffset;

    // ファイルの先頭部分からCONNECTIONレコードを読み取る
    while (offset < arrayBuffer.byteLength) {
      try {
        const record = readRecord(dataView, offset);
        if (!record) break;

        const op = record.header.fields.get('op')?.[0];

        // CONNECTION レコード
        if (op === 0x07) {
          const conn = record.header.fields.get('conn');
          const topic = record.header.fields.get('topic');
          const type = record.header.fields.get('type');

          if (conn && topic && type) {
            const connId = new DataView(conn.buffer, conn.byteOffset, conn.byteLength).getUint32(0, true);
            const topicStr = new TextDecoder().decode(topic);
            const typeStr = new TextDecoder().decode(type);

            connections.set(connId, { topic: topicStr, type: typeStr });
          }
        }

        // CHUNKに到達したらCONNECTIONは終わり
        if (op === 0x05) {
          break;
        }

        offset = record.nextOffset;
      } catch (e) {
        console.warn('[rosbagParser] Error reading connection:', e.message);
        break;
      }
    }

    console.log('[rosbagParser] Found', connections.size, 'connections');

    // 対象トピックのconnection IDを見つける
    let targetConnId = null;
    for (const [connId, info] of connections.entries()) {
      if (info.topic === topicName) {
        targetConnId = connId;
        console.log('[rosbagParser] Target topic found:', topicName, 'type:', info.type, 'connId:', connId);
        break;
      }
    }

    if (targetConnId === null) {
      console.warn('[rosbagParser] Topic not found:', topicName);
      return [];
    }

    // ステップ2: ファイル全体をスキャンしてCHUNKを見つけ、メッセージを抽出
    const messages = [];
    offset = header.nextOffset;

    console.log('[rosbagParser] Scanning file for CHUNK records...');
    let chunkCount = 0;

    while (offset < arrayBuffer.byteLength) {
      try {
        // レコードヘッダー長を読み取る
        if (offset + 4 > arrayBuffer.byteLength) break;
        const headerLen = dataView.getUint32(offset, true);

        if (headerLen === 0 || headerLen > 1024 * 1024) {
          console.warn('[rosbagParser] Invalid header length at offset', offset);
          break;
        }

        if (offset + 4 + headerLen + 4 > arrayBuffer.byteLength) break;

        // ヘッダーを読み取る
        const headerFields = readHeaderFields(dataView, offset + 4, headerLen);
        const op = headerFields.fields.get('op')?.[0];

        // CHUNK レコード (op=0x05)
        if (op === 0x05) {
          chunkCount++;
          console.log('[rosbagParser] Found CHUNK at offset', offset);

          // CHUNKのデータ部分を解析
          const chunkMessages = extractMessagesFromChunk(dataView, offset, targetConnId);
          console.log('[rosbagParser] Extracted', chunkMessages.length, 'messages from chunk', chunkCount);
          messages.push(...chunkMessages);
        }

        // 次のレコードへ
        const dataLen = dataView.getUint32(offset + 4 + headerLen, true);
        offset += 4 + headerLen + 4 + dataLen;
      } catch (e) {
        console.warn('[rosbagParser] Error reading record at offset', offset, ':', e.message);
        break;
      }
    }

    console.log('[rosbagParser] Scanned', chunkCount, 'chunks, extracted', messages.length, 'messages from topic:', topicName);
    return messages;
  } catch (error) {
    console.error('[rosbagParser] Error extracting messages:', error);
    throw error;
  }
}

/**
 * LaserScanメッセージをデコード
 * @param {Uint8Array} data - メッセージデータ
 * @returns {Object} デコードされたLaserScanデータ
 */
export function decodeLaserScan(data) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let offset = 0;

  // Header
  // uint32 seq
  const seq = view.getUint32(offset, true);
  offset += 4;

  // time stamp (uint32 secs, uint32 nsecs)
  const stampSec = view.getUint32(offset, true);
  offset += 4;
  const stampNsec = view.getUint32(offset, true);
  offset += 4;

  // string frame_id (uint32 length + string data)
  const frameIdLen = view.getUint32(offset, true);
  offset += 4;
  const frameId = new TextDecoder().decode(new Uint8Array(data.buffer, data.byteOffset + offset, frameIdLen));
  offset += frameIdLen;

  // float32 angle_min
  const angle_min = view.getFloat32(offset, true);
  offset += 4;

  // float32 angle_max
  const angle_max = view.getFloat32(offset, true);
  offset += 4;

  // float32 angle_increment
  const angle_increment = view.getFloat32(offset, true);
  offset += 4;

  // float32 time_increment
  const time_increment = view.getFloat32(offset, true);
  offset += 4;

  // float32 scan_time
  const scan_time = view.getFloat32(offset, true);
  offset += 4;

  // float32 range_min
  const range_min = view.getFloat32(offset, true);
  offset += 4;

  // float32 range_max
  const range_max = view.getFloat32(offset, true);
  offset += 4;

  // float32[] ranges (uint32 length + array data)
  const rangesLen = view.getUint32(offset, true);
  offset += 4;
  const ranges = new Float32Array(rangesLen);
  for (let i = 0; i < rangesLen; i++) {
    ranges[i] = view.getFloat32(offset, true);
    offset += 4;
  }

  // float32[] intensities (uint32 length + array data)
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

/**
 * CHUNKレコードからメッセージを抽出
 */
function extractMessagesFromChunk(dataView, chunkOffset, targetConnId) {
  const messages = [];

  try {
    // CHUNKヘッダーを読み取る
    const headerLen = dataView.getUint32(chunkOffset, true);
    const headerFields = readHeaderFields(dataView, chunkOffset + 4, headerLen);

    // データ長を読み取る
    const dataLenOffset = chunkOffset + 4 + headerLen;
    const dataLen = dataView.getUint32(dataLenOffset, true);
    const dataOffset = dataLenOffset + 4;

    console.log('[extractMessagesFromChunk] Chunk at offset', chunkOffset, 'data length:', dataLen);

    // 圧縮フィールドをチェック
    const compression = headerFields.fields.get('compression');
    const compressionStr = compression ? new TextDecoder().decode(compression) : 'none';

    if (compressionStr !== 'none') {
      console.warn('[extractMessagesFromChunk] Compressed chunks not yet supported:', compressionStr);
      return messages;
    }

    // CHUNKデータ内のメッセージレコードを読み取る
    let offset = dataOffset;
    const chunkEnd = dataOffset + dataLen;
    let messageCount = 0;
    let matchedCount = 0;

    while (offset < chunkEnd && offset < dataView.byteLength) {
      try {
        // レコードヘッダー長
        if (offset + 4 > dataView.byteLength) break;
        const msgHeaderLen = dataView.getUint32(offset, true);
        offset += 4;

        if (offset + msgHeaderLen > dataView.byteLength) break;

        // ヘッダーを読み取る
        const msgHeader = readHeaderFields(dataView, offset, msgHeaderLen);
        offset += msgHeaderLen;

        // データ長
        if (offset + 4 > dataView.byteLength) break;
        const msgDataLen = dataView.getUint32(offset, true);
        offset += 4;

        if (offset + msgDataLen > dataView.byteLength) break;

        const op = msgHeader.fields.get('op')?.[0];

        // MESSAGE_DATA レコード (op=0x02)
        if (op === 0x02) {
          messageCount++;
          const conn = msgHeader.fields.get('conn');
          if (conn) {
            const connId = new DataView(conn.buffer, conn.byteOffset, conn.byteLength).getUint32(0, true);

            if (connId === targetConnId) {
              matchedCount++;
              // メッセージデータを抽出
              const messageData = new Uint8Array(dataView.buffer, offset, msgDataLen);

              // タイムスタンプを取得
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
        console.warn('[extractMessagesFromChunk] Error reading message in chunk:', e.message);
        break;
      }
    }

    console.log('[extractMessagesFromChunk] Found', messageCount, 'total messages,', matchedCount, 'matched target connection');
  } catch (e) {
    console.warn('[extractMessagesFromChunk] Error extracting from chunk:', e.message);
  }

  return messages;
}

/**
 * Rosbagヘッダーを読み取る
 */
function readHeader(dataView, offset) {
  // オフセットの妥当性チェック
  if (offset + 4 > dataView.byteLength) {
    throw new Error(`Cannot read header: offset ${offset} + 4 exceeds buffer length ${dataView.byteLength}`);
  }

  const headerLen = dataView.getUint32(offset, true);

  // ヘッダー長の妥当性チェック
  if (headerLen > dataView.byteLength || headerLen > 1024 * 1024) {
    throw new Error(`Invalid header length: ${headerLen} (max 1MB allowed, buffer size: ${dataView.byteLength})`);
  }

  offset += 4;

  const fields = new Map();
  let headerOffset = 0;

  while (headerOffset < headerLen) {
    if (offset + headerOffset + 4 > dataView.byteLength) {
      break;
    }

    const fieldLen = dataView.getUint32(offset + headerOffset, true);
    headerOffset += 4;

    if (fieldLen === 0) break;

    // フィールド長の妥当性チェック
    if (fieldLen > headerLen || fieldLen > 1024 * 1024) {
      break;
    }

    if (offset + headerOffset + fieldLen > dataView.byteLength) {
      break;
    }

    // フィールドデータを取得
    const fieldData = new Uint8Array(dataView.buffer, offset + headerOffset, fieldLen);
    headerOffset += fieldLen;

    // '=' で分割してキーと値を取得
    const equalPos = fieldData.indexOf(0x3d); // '=' の ASCII コード
    if (equalPos !== -1) {
      const key = new TextDecoder().decode(fieldData.subarray(0, equalPos));
      const value = fieldData.subarray(equalPos + 1);
      fields.set(key, value);
    }
  }

  return {
    fields,
    nextOffset: offset + headerLen
  };
}

/**
 * Rosbagレコードを読み取る
 */
function readRecord(dataView, offset) {
  if (offset + 8 > dataView.byteLength) {
    return null;
  }

  // ヘッダー長を読み取り
  const headerLen = dataView.getUint32(offset, true);
  offset += 4;

  if (offset + headerLen + 4 > dataView.byteLength) {
    return null;
  }

  // ヘッダーを読み取り
  const header = readHeaderFields(dataView, offset, headerLen);
  offset += headerLen;

  // データ長を読み取り
  const dataLen = dataView.getUint32(offset, true);
  offset += 4;

  if (offset + dataLen > dataView.byteLength) {
    return null;
  }

  // CONNECTIONレコード（op=0x07）の場合、データ部分も解析
  // CONNECTION recordのデータ部分にはtype, md5sum, message_definitionなどが含まれる
  const op = header.fields.get('op')?.[0];
  if (op === 0x07 && dataLen > 0) {
    try {
      const dataFields = readHeaderFields(dataView, offset, dataLen);
      // データ部分のフィールドをヘッダーにマージ
      for (const [key, value] of dataFields.fields.entries()) {
        if (!header.fields.has(key)) {
          header.fields.set(key, value);
        }
      }
    } catch (e) {
      console.warn('[readRecord] Error parsing CONNECTION data section:', e.message);
    }
  }

  // データ部分をスキップ
  offset += dataLen;

  return {
    header,
    nextOffset: offset
  };
}

/**
 * ヘッダーフィールドを読み取る
 */
function readHeaderFields(dataView, offset, length) {
  const fields = new Map();
  let headerOffset = 0;

  while (headerOffset < length) {
    if (offset + headerOffset + 4 > dataView.byteLength) {
      break;
    }

    const fieldLen = dataView.getUint32(offset + headerOffset, true);
    headerOffset += 4;

    if (fieldLen === 0 || offset + headerOffset + fieldLen > dataView.byteLength) {
      break;
    }

    // フィールドデータの範囲チェック
    try {
      // フィールドデータを取得
      const fieldData = new Uint8Array(dataView.buffer, offset + headerOffset, fieldLen);
      headerOffset += fieldLen;

      // '=' で分割
      const equalPos = fieldData.indexOf(0x3d);
      if (equalPos !== -1) {
        const key = new TextDecoder().decode(fieldData.subarray(0, equalPos));
        const value = fieldData.subarray(equalPos + 1);
        fields.set(key, value);
      }
    } catch (e) {
      console.warn('[rosbagParser] Error reading field:', e.message);
      break;
    }
  }

  return { fields };
}
