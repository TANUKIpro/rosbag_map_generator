/**
 * 簡易的なRosbagパーサー
 *
 * Rosbagファイルからトピック一覧を抽出する
 * 完全なパーサーではなく、トピック情報の取得に特化
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
    console.log('[rosbagParser] Reading first', maxReadSize, 'bytes for topic detection');

    const blob = file.slice(0, maxReadSize);
    const arrayBuffer = await blob.arrayBuffer();
    const dataView = new DataView(arrayBuffer);

    console.log('[rosbagParser] Chunk loaded, size:', arrayBuffer.byteLength, 'bytes');

    // デバッグ: 最初の100バイトを16進数で表示
    const firstBytes = new Uint8Array(arrayBuffer, 0, Math.min(100, arrayBuffer.byteLength));
    console.log('[rosbagParser] First 100 bytes (hex):');
    let hexStr = '';
    for (let i = 0; i < firstBytes.length; i++) {
      hexStr += firstBytes[i].toString(16).padStart(2, '0') + ' ';
      if ((i + 1) % 16 === 0) {
        console.log(hexStr);
        hexStr = '';
      }
    }
    if (hexStr) console.log(hexStr);

    // デバッグ: 最初の4バイトを様々な方法で解釈
    console.log('[rosbagParser] First 4 bytes as uint32 (little endian):', dataView.getUint32(0, true));
    console.log('[rosbagParser] First 4 bytes as uint32 (big endian):', dataView.getUint32(0, false));

    // Rosbag v2.0 のマジックナンバーをチェック
    const magicBytes = new Uint8Array(arrayBuffer, 0, Math.min(13, arrayBuffer.byteLength));
    const magic = new TextDecoder().decode(magicBytes);
    console.log('[rosbagParser] Magic string:', magic);

    if (!magic.startsWith('#ROSBAG V2.0')) {
      console.warn('[rosbagParser] Warning: File does not start with expected magic string "#ROSBAG V2.0"');
      console.warn('[rosbagParser] Detected:', magic);
    }

    // マジックナンバーの後にある実際のヘッダー開始位置を探す
    let headerStart = 13; // "#ROSBAG V2.0\n" = 13 bytes
    if (magic.startsWith('#ROSBAG V2.0')) {
      console.log('[rosbagParser] Valid rosbag v2.0 file detected');
    } else {
      // マジックナンバーがない場合は、最初からヘッダーと仮定
      headerStart = 0;
    }

    // Rosbagヘッダーのチェック
    const header = readHeader(dataView, headerStart);
    console.log('[rosbagParser] Bag header:', header);

    if (!header.fields.has('op')) {
      console.warn('[rosbagParser] Warning: No "op" field in bag header');
      console.warn('[rosbagParser] Available fields:', Array.from(header.fields.keys()));
    } else {
      const op = header.fields.get('op')[0];
      console.log('[rosbagParser] Op code:', op);
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
      console.log('[rosbagParser] Index section position:', indexPos);
    }

    // トピック情報を格納
    const connections = new Map(); // connection_id -> {topic, type}
    const topics = new Map(); // topic_name -> {type, messageCount}
    let totalRecordCount = 0; // 処理したレコード数の合計

    // ステップ1: ファイルの先頭部分からCONNECTIONレコードを読み取る
    // CONNECTIONレコードは通常CHUNKの直前に配置される
    console.log('[rosbagParser] Scanning for CONNECTION records from file start...');
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

              console.log('[rosbagParser] Found CONNECTION at start:', connId, topicStr, typeStr);
            }
          }

          // CHUNKに到達したら、CONNECTIONレコードは終わり
          if (op === 0x05) {
            console.log('[rosbagParser] Reached CHUNK, stopping CONNECTION scan');
            break;
          }

          offset = record.nextOffset;
          recordCount++;
        } catch (e) {
          console.warn('[rosbagParser] Error in start scan:', e.message);
          break;
        }
      }

      console.log('[rosbagParser] Start scan complete, found', connections.size, 'connections');
    }

    // ステップ2: インデックスセクションからCHUNK_INFOとCONNECTIONを読み取る
    if (indexPos !== null && indexPos < arrayBuffer.byteLength) {
      console.log('[rosbagParser] Reading index section at position:', indexPos);
      let offset = indexPos;
      let recordCount = 0;
      const maxRecords = 1000; // インデックスセクションのレコード数制限

      while (offset < arrayBuffer.byteLength && recordCount < maxRecords) {
        try {
          const record = readRecord(dataView, offset);

          if (!record) {
            console.log('[rosbagParser] Reached end of valid records at offset:', offset);
            break;
          }

          const op = record.header.fields.get('op')?.[0];

          // デバッグ: 見つかったopコードをすべてログ
          const opName = {
            0x02: 'MESSAGE_DATA',
            0x03: 'BAG_HEADER',
            0x04: 'INDEX_DATA',
            0x05: 'CHUNK',
            0x06: 'CHUNK_INFO',
            0x07: 'CONNECTION'
          }[op] || `UNKNOWN(0x${op?.toString(16)})`;

          console.log(`[rosbagParser] Index record ${recordCount}: op=${opName} (0x${op?.toString(16).padStart(2, '0')}), offset=${offset}`);

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

          // 進捗ログ（100レコードごと）
          if (recordCount % 100 === 0) {
            console.log(`[rosbagParser] Processed ${recordCount} index records, found ${connections.size} connections`);
          }
        } catch (e) {
          console.warn('[rosbagParser] Error reading index record at offset', offset, ':', e.message);
          break;
        }
      }

      totalRecordCount = recordCount;
      console.log('[rosbagParser] Index section processing complete');
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

    console.log('[rosbagParser] Parsing complete.');
    console.log('[rosbagParser] Processed', totalRecordCount, 'records');
    console.log('[rosbagParser] Found', connections.size, 'connections');
    console.log('[rosbagParser] Found', topics.size, 'unique topics');

    // Map を配列に変換
    const topicList = Array.from(topics.entries()).map(([name, data]) => ({
      name,
      type: data.type,
      messageCount: data.messageCount
    }));

    console.log('[rosbagParser] Topic list:', topicList);

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
 * Rosbagヘッダーを読み取る
 */
function readHeader(dataView, offset) {
  console.log('[readHeader] Reading header at offset:', offset);

  // オフセットの妥当性チェック
  if (offset + 4 > dataView.byteLength) {
    throw new Error(`Cannot read header: offset ${offset} + 4 exceeds buffer length ${dataView.byteLength}`);
  }

  const headerLen = dataView.getUint32(offset, true);
  console.log('[readHeader] Header length:', headerLen);

  // ヘッダー長の妥当性チェック
  if (headerLen > dataView.byteLength || headerLen > 1024 * 1024) {
    console.error('[readHeader] Invalid header length:', headerLen);
    console.error('[readHeader] Buffer length:', dataView.byteLength);
    console.error('[readHeader] Offset:', offset);
    console.error('[readHeader] First 20 bytes from offset:');
    const debugBytes = new Uint8Array(dataView.buffer, offset, Math.min(20, dataView.byteLength - offset));
    console.error('[readHeader] Hex:', Array.from(debugBytes).map(b => b.toString(16).padStart(2, '0')).join(' '));
    throw new Error(`Invalid header length: ${headerLen} (max 1MB allowed, buffer size: ${dataView.byteLength})`);
  }

  offset += 4;

  const fields = new Map();
  let headerOffset = 0;

  while (headerOffset < headerLen) {
    if (offset + headerOffset + 4 > dataView.byteLength) {
      console.warn('[readHeader] Reached end of buffer while reading fields');
      break;
    }

    const fieldLen = dataView.getUint32(offset + headerOffset, true);
    headerOffset += 4;

    if (fieldLen === 0) break;

    // フィールド長の妥当性チェック
    if (fieldLen > headerLen || fieldLen > 1024 * 1024) {
      console.warn('[readHeader] Invalid field length:', fieldLen, 'at offset:', offset + headerOffset - 4);
      break;
    }

    if (offset + headerOffset + fieldLen > dataView.byteLength) {
      console.warn('[readHeader] Field exceeds buffer length');
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
      console.log('[readHeader] Field:', key, '=', value.length, 'bytes');
    }
  }

  console.log('[readHeader] Total fields found:', fields.size);

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
