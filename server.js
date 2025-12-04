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

// Gerar CSV dos Endereços e baixar
app.get('/gerar-csv', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u.nome, e.rua, e.bairro 
      FROM enderecos e JOIN usuarios u ON e.usuario_id = u.id
    `);
    
    const filePath = __dirname + '/enderecos_usuarios.csv';
    const csvWriter = createCsvWriter({
      path: filePath,
      header: [
        {id: 'nome', title: 'NOME'},
        {id: 'rua', title: 'RUA'},
        {id: 'bairro', title: 'BAIRRO'}
      ]
    });

    await csvWriter.writeRecords(result.rows);
    res.download(filePath, 'enderecos_usuarios.csv'); 
    
  } catch (err) {
    res.status(500).send("Erro ao gerar CSV: " + err.message);
  }
});

// Gerar JSON dos Documentos e Baixar
app.get('/gerar-json', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM documentos');
    const dados = JSON.stringify(result.rows, null, 2);
    const filePath = __dirname + '/documentos.json';
    
    fs.writeFileSync(filePath, dados);
    res.download(filePath, 'documentos.json');

  } catch (err) {
    res.status(500).send("Erro ao gerar JSON: " + err.message);
  }
});

// Exportar Nomes em PDF e Baixar
app.get('/gerar-pdf', async (req, res) => {
  try {
    const result = await pool.query('SELECT nome FROM usuarios');
    const filePath = __dirname + '/lista_nomes.pdf';
    
    const doc = new PDFDocument();
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);
    
    doc.fontSize(20).text('Lista de Usuários Cadastrados', { align: 'center' });
    doc.moveDown();
    
    result.rows.forEach(user => {
      doc.fontSize(12).text(`- ${user.nome}`);
    });
    
    doc.end();

    stream.on('finish', function() {
       res.download(filePath, 'lista_nomes.pdf');
    });

  } catch (err) {
    res.status(500).send("Erro ao gerar PDF: " + err.message);
  }
});

// Listar todos os usuários
app.get('/usuarios', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u.id, u.nome, u.email, u.senha, 
             e.rua, e.bairro, 
             d.cpf, d.rg, d.cnh 
      FROM usuarios u 
      JOIN enderecos e ON u.id = e.usuario_id 
      JOIN documentos d ON u.id = d.usuario_id
      ORDER BY u.id ASC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Editar Usuário
app.put('/usuarios/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { nome, email, senha, rua, bairro, cpf, rg, cnh } = req.body;

    await client.query('BEGIN');

    await client.query(
      'UPDATE usuarios SET nome=$1, email=$2, senha=$3 WHERE id=$4',
      [nome, email, senha, id]
    );

    await client.query(
      'UPDATE enderecos SET rua=$1, bairro=$2 WHERE usuario_id=$3',
      [rua, bairro, id]
    );

    await client.query(
      'UPDATE documentos SET cpf=$1, rg=$2, cnh=$3 WHERE usuario_id=$4',
      [cpf, rg, cnh, id]
    );

    await client.query('COMMIT');
    res.json({ message: 'Usuário atualizado com sucesso!' });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Erro ao atualizar: ' + e.message });
  } finally {
    client.release();
  }
});

// Excluir Usuário
app.delete('/usuarios/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM usuarios WHERE id = $1', [id]);
    res.json({ message: 'Usuário excluído com sucesso!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(port, () => {
  console.log(`Servidor rodando em http://localhost:${port}`);
});