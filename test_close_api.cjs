const http = require('http');

const data = JSON.stringify({ clientId: '3afa3352-9e59-4ba5-9665-c4d927fdd0ef' });

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/chat/close',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

const req = http.request(options, res => {
  console.log(`statusCode: ${res.statusCode}`);
  res.on('data', d => process.stdout.write(d));
});

req.on('error', error => console.error(error));
req.write(data);
req.end();
