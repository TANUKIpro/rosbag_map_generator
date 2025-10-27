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

    // Rosbagヘッダーのチェック
    const header = readHeader(dataView, 0);
    console.log('[rosbagParser] Bag header:', header);

    if (!header.fields.has('op') || header.fields.get('op')[0] !== 0x03) {
      throw new Error('Invalid rosbag file: missing or invalid bag header');
    }

    // トピック情報を格納
    const connections = new Map(); // connection_id -> {topic, type}
    const topics = new Map(); // topic_name -> {type, messageCount}

    let offset = header.nextOffset;
    let recordCount = 0;
    const maxRecords = 5000; // 最大読み取りレコード数（トピック検出には十分）

    // レコードを順次読み取り
    // 読み込んだチャンク内のみを処理
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
        // Connection レコードが一定期間見つからなければ、トピック検出完了とみなす
        if (connections.size > 0 && recordCount > 1000) {
          console.log('[rosbagParser] Topic detection likely complete, stopping early');
          break;
        }
      } catch (e) {
        console.warn('[rosbagParser] Error reading record at offset', offset, ':', e.message);
        // エラーが発生したら、そこで終了（部分的な結果を返す）
        break;
      }
    }

    console.log('[rosbagParser] Parsing complete.');
    console.log('[rosbagParser] Processed', recordCount, 'records');
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
  const headerLen = dataView.getUint32(offset, true);
  offset += 4;

  const fields = new Map();
  let headerOffset = 0;

  while (headerOffset < headerLen) {
    const fieldLen = dataView.getUint32(offset + headerOffset, true);
    headerOffset += 4;

    if (fieldLen === 0) break;

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

  // データ部分はスキップ（トピック抽出には不要）
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
