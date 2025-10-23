const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors());
app.use(express.json());

app.get('/status', (req, res) => {
  res.status(200).json({ ok: true, status: 'running', service: 'sophia-voice' });
});

app.get('/', (req, res) => {
  res.status(200).send('Sophia backend live');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server up on ' + PORT));
