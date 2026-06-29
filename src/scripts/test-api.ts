import http from 'http';

const run = () => {
  const payload = JSON.stringify({
    category: ["6926d7c0d53f3a772c6f08af"],
    skip: 0,
    limit: 10,
    includeMeta: true
  });

  const req = http.request({
    hostname: 'localhost',
    port: 5000,
    path: '/premind/api/product/filter',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload)
    }
  }, (res) => {
    let data = '';
    res.on('data', (chunk) => {
      data += chunk;
    });
    res.on('end', () => {
      console.log('STATUS:', res.statusCode);
      try {
        const json = JSON.parse(data);
        console.log('SUCCESS:', json.success);
        console.log('MESSAGE:', json.message);
        console.log('PRODUCTS COUNT:', json.data?.length);
        console.log('META:', JSON.stringify(json.meta, null, 2));
        if (json.data && json.data.length > 0) {
          console.log('First product name:', json.data[0].name);
          console.log('First product category:', json.data[0].category);
        }
      } catch (err) {
        console.log('RAW DATA:', data.substring(0, 1000));
      }
    });
  });

  req.on('error', (err) => {
    console.error('API Error:', err.message);
  });

  req.write(payload);
  req.end();
};

run();
