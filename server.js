const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const fs = require('fs');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const PDFDocument = require('pdfkit');

const app = express();
const port = 3000;

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'crud_ubuntu',
  password: '3666',
  port: 5432,
});

app.use(cors());
app.use(express.json());
app.use(express.static('public')); 

app.post('/cadastrar', async (req, res) => {
  const client = await pool.connect();
  try {
    const { nome, email, senha, rua, bairro, cpf, rg, cnh } = req.body;

    await client.query('BEGIN');

    // Usuário
    const userRes = await client.query(
      'INSERT INTO usuarios (nome, email, senha) VALUES ($1, $2, $3) RETURNING id',
      [nome, email, senha]
    );
    const usuarioId = userRes.rows[0].id;

    // Endereço
    await client.query(
      'INSERT INTO enderecos (usuario_id, rua, bairro) VALUES ($1, $2, $3)',
      [usuarioId, rua, bairro]
    );

    // Documentos
    await client.query(
      'INSERT INTO documentos (usuario_id, cpf, rg, cnh) VALUES ($1, $2, $3, $4)',
      [usuarioId, cpf, rg, cnh]
    );

    await client.query('COMMIT');
    res.json({ message: 'Cadastro realizado com sucesso!' });

  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e);
    res.status(500).json({ error: 'Erro ao cadastrar: ' + e.message });
  } finally {
    client.release();
  }
});

// CSV dos Endereços
app.get('/gerar-csv', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u.nome, e.rua, e.bairro 
      FROM enderecos e JOIN usuarios u ON e.usuario_id = u.id
    `);
    
    const csvWriter = createCsvWriter({
      path: 'enderecos_usuarios.csv',
      header: [
        {id: 'nome', title: 'NOME'},
        {id: 'rua', title: 'RUA'},
        {id: 'bairro', title: 'BAIRRO'}
      ]
    });

    await csvWriter.writeRecords(result.rows);
    res.json({ message: 'Arquivo enderecos_usuarios.csv criado na pasta do projeto!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// JSON dos Documentos
app.get('/gerar-json', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM documentos');
    const dados = JSON.stringify(result.rows, null, 2);
    
    fs.writeFileSync('documentos.json', dados);
    res.json({ message: 'Arquivo documentos.json criado na pasta do projeto!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Exportar Nomes em PDF
app.get('/gerar-pdf', async (req, res) => {
  try {
    const result = await pool.query('SELECT nome FROM usuarios');
    
    const doc = new PDFDocument();
    doc.pipe(fs.createWriteStream('lista_nomes.pdf'));
    
    doc.fontSize(20).text('Lista de Usuários Cadastrados', { align: 'center' });
    doc.moveDown();
    
    result.rows.forEach(user => {
      doc.fontSize(12).text(`- ${user.nome}`);
    });
    
    doc.end();
    res.json({ message: 'Arquivo lista_nomes.pdf criado na pasta do projeto!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(port, () => {
  console.log(`Servidor rodando em http://localhost:${port}`);
});