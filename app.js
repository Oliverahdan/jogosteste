const express = require('express');
const path = require('path');
const mysql = require('mysql2/promise');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');

const app = express();
const port = 3000;

const dbConfig = {
    host: 'localhost',
    user: 'root',
    password: 'danisilva0304',
    database: 'gamedan'
};

// Função para criar e retornar uma nova conexão
async function createConnection() {
    return await mysql.createConnection(dbConfig);
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Middleware para garantir a criação de uma nova conexão antes de cada rota
app.use(async (req, res, next) => {
    req.locals = {}; // Criar um objeto locals para armazenar variáveis locais

    // Criar uma nova conexão e armazená-la em req.locals.connection
    req.locals.connection = await createConnection();
    next();
});

app.get('/descricao', async (req, res) => {
    try {
        const gameId = req.query.id;

        if (!gameId) {
            return res.status(400).send('ID do jogo não fornecido');
        }

        console.log('Recebido pedido para o jogo com ID:', gameId);

        const [rows, fields] = await req.locals.connection.execute('SELECT * FROM games WHERE id = ?', [gameId]);

        if (rows.length === 0) {
            console.log('Jogo não encontrado no banco de dados');
            return res.status(404).send('Jogo não encontrado');
        }

        console.log('Dados do jogo encontrado:', rows[0]);

        res.sendFile(path.join(__dirname, '/descricao/index.html'));
    } catch (error) {
        console.error('Erro na consulta ao banco de dados:', error);
        res.status(500).send('Erro interno no servidor');
    }
});

app.post('/login', async (req, res) => {
    const { email, senha } = req.body;

    try {
        const [results] = await req.locals.connection.execute('SELECT * FROM users WHERE email = ? AND password = ?', [email, senha]);

        if (results.length === 0) {
            res.status(401).json({ message: 'Credenciais inválidas' });
        } else {
            res.cookie('userId', results[0].id);
            res.redirect('/jogos');
        }
    } catch (error) {
        console.error('Erro no servidor:', error);
        res.status(500).json({ message: 'Erro no servidor' });
    }
});

// Rota para comprar
app.post('/comprar', async (req, res) => {
    const gameId = req.body.gameId;
    const userId = req.body.userId;

    const userCookie = req.cookies.userId;

    if (!userCookie || userCookie !== userId) {
        return res.status(401).json({ message: 'Usuário não autenticado' });
    }

    try {
        const [results] = await req.locals.connection.execute('INSERT INTO shop (game, user) VALUES (?, ?)', [gameId, userId]);
        res.json({ message: 'Compra realizada com sucesso' });
    } catch (error) {
        console.error('Erro ao realizar a compra:', error);
        res.status(500).json({ message: 'Erro interno no servidor ao realizar a compra' });
    }
});

app.get('/api/user/:id', async (req, res) => {
    const userId = req.params.id;

    try {
        const connection = await createConnection();
        const [results] = await connection.execute('SELECT * FROM users WHERE id = ?', [userId]);

        if (results.length === 0) {
            res.status(404).json({ message: 'Usuário não encontrado' });
        } else {
            res.json(results[0]);
        }

        await connection.end();
    } catch (error) {
        console.error('Erro no servidor:', error);
        res.status(500).json({ message: 'Erro no servidor' });
    }
});

app.get('/compras', async (req, res) => {
    try {
        const userId = req.cookies.userId;

        if (!userId) {
            return res.status(401).json({ message: 'Usuário não autenticado' });
        }

        const [results] = await req.locals.connection.execute(`
            SELECT shop.game, shop.user, games.image, games.name, games.price
            FROM shop
            JOIN games ON shop.game = games.id
            WHERE shop.user = ?
        `, [userId]);

        res.json(results);
    } catch (error) {
        console.error('Erro ao buscar compras:', error);
        res.status(500).json({ message: 'Erro interno no servidor ao buscar compras' });
    }
});

app.delete('/excluir-compra/:game/:user', async (req, res) => {
    const gameID = req.params.game;
    const userID = req.params.user;

    console.log('UserID:', userID);
    console.log('GameID:', gameID);
    try {
        // Buscar detalhes do jogo associado à compra
        const [gameDetails] = await req.locals.connection.execute('SELECT * FROM games WHERE id = ?', [gameID]);

        if (gameDetails.length === 0) {
            res.status(404).json({ message: 'Detalhes do jogo não encontrados' });
            return;
        }

        // Agora você pode usar os detalhes do jogo conforme necessário

        // Exemplo: excluindo a compra associada ao usuário e jogo
        const [deleteResults] = await req.locals.connection.execute('DELETE FROM shop WHERE user = ? AND game = ?', [userID, gameID]);

        if (deleteResults.affectedRows === 0) {
            res.status(404).json({ message: 'Compra não encontrada para exclusão' });
        } else {
            res.json({ message: 'Compra excluída com sucesso', game: gameDetails[0] });
        }
    } catch (error) {
        console.error('Erro ao excluir a compra:', error);
        res.status(500).json({ message: 'Erro interno no servidor ao excluir a compra' });
    }
});

// Rota para obter a quantidade de estrelas
app.get('/api/estrelas', async (req, res) => {
    const gameId = parseInt(req.query.gameId);
    const userId = parseInt(req.query.userId);

    try {
        const [ratingResults] = await req.locals.connection.execute('SELECT qt FROM stars WHERE game = ? AND user = ?', [gameId, userId]);

        if (ratingResults.length > 0) {
            res.json({ qt: ratingResults[0].qt });
        } else {
            res.status(404).json({ error: 'Avaliação não encontrada' });
        }
    } catch (error) {
        console.error('Erro ao obter a avaliação do banco de dados:', error);
        res.status(500).json({ message: 'Erro interno no servidor' });
    }
});


/// Rota para salvar avaliação
app.post('/salvar-avaliacao', async (req, res) => {
    const gameId = req.body.gameId;
    const userId = req.body.userId;
    const qtEstrelas = req.body.qtEstrelas;

    const userCookie = req.cookies.userId;

    if (!userCookie || userCookie !== userId) {
        return res.status(401).json({ message: 'Usuário não autenticado' });
    }

    try {
        // Verificar se o usuário já avaliou o jogo
        const [existingRating] = await req.locals.connection.execute('SELECT * FROM stars WHERE game = ? AND user = ?', [gameId, userId]);

        if (existingRating.length > 0) {
            // O usuário já avaliou o jogo; atualizar a avaliação existente
            const [updateResults] = await req.locals.connection.execute('UPDATE stars SET qt = ? WHERE game = ? AND user = ?', [qtEstrelas, gameId, userId]);

            if (updateResults.affectedRows === 0) {
                res.status(500).json({ message: 'Erro ao atualizar a avaliação' });
            } else {
                res.json({ message: 'Avaliação atualizada com sucesso' });
            }
        } else {
            // O usuário ainda não avaliou o jogo; inserir uma nova avaliação
            const [insertResults] = await req.locals.connection.execute('INSERT INTO stars (qt, game, user) VALUES (?, ?, ?)', [qtEstrelas, gameId, userId]);

            if (insertResults.affectedRows === 0) {
                res.status(500).json({ message: 'Erro ao salvar a avaliação' });
            } else {
                res.json({ message: 'Avaliação salva com sucesso' });
            }
        }
    } catch (error) {
        console.error('Erro ao salvar/atualizar a avaliação no banco de dados:', error);
        res.status(500).json({ message: 'Erro interno no servidor ao salvar/atualizar a avaliação' });
    }
});

// Exemplo de definição da função obterIdDoUsuario
function obterIdDoUsuario(req) {
    // Lógica para obter o ID do usuário do cookie ou de onde quer que esteja armazenado
    // Exemplo: suponha que o ID do usuário esteja armazenado no cookie 'userId'
    const cookiesString = req.headers.cookie || '';
    const cookiesArray = cookiesString.split(';').map(cookie => cookie.trim());

    for (const cookie of cookiesArray) {
        const [cookieName, cookieValue] = cookie.split('=');

        if (cookieName === 'userId') {
            return cookieValue;
        }
    }

    return null; // Retorna null se o ID do usuário não for encontrado
}

app.get('/api/comentarios', async (req, res) => {
    try {
        const gameId = req.query.gameId;

        if (!gameId) {
            return res.status(400).json({ message: 'ID do jogo não fornecido' });
        }

        const [comentariosResults] = await req.locals.connection.execute(
            'SELECT comments.id, comments.comment, comments.game, comments.user, users.name AS userName ' +
            'FROM comments ' +
            'INNER JOIN users ON comments.user = users.id ' +
            'WHERE comments.game = ?',
            [gameId]
        );

        res.json(comentariosResults);
    } catch (error) {
        console.error('Erro ao buscar comentários:', error);
        res.status(500).json({ message: 'Erro interno no servidor ao buscar comentários' });
    }
});

// Rota para excluir comentário
app.delete('/excluir-comentario/:commentId', async (req, res) => {
    const commentId = req.params.commentId;

    try {
        // Verificar se o comentário existe
        const [comment] = await req.locals.connection.execute('SELECT * FROM comments WHERE id = ?', [commentId]);

        if (comment.length === 0) {
            res.status(404).json({ message: 'Comentário não encontrado' });
            return;
        }

        // Verificar se o usuário autenticado é o autor do comentário
        const userId = obterIdDoUsuario(req);
        if (userId !== comment[0].user.toString()) {
            res.status(403).json({ message: 'Você não tem permissão para excluir este comentário' });
            return;
        }

        // Excluir o comentário
        const [deleteResults] = await req.locals.connection.execute('DELETE FROM comments WHERE id = ?', [commentId]);

        if (deleteResults.affectedRows === 0) {
            res.status(500).json({ message: 'Erro ao excluir o comentário' });
        } else {
            res.json({ message: 'Comentário excluído com sucesso' });
        }
    } catch (error) {
        console.error('Erro ao excluir o comentário:', error);
        res.status(500).json({ message: 'Erro interno no servidor ao excluir o comentário' });
    }
});


// Restante do seu código
app.post('/salvar-comentario', async (req, res) => {
    const comment = req.body.comment;
    const gameId = req.body.gameId;

    try {
        const userId = obterIdDoUsuario(req);

        if (!userId) {
            return res.status(401).json({ message: 'Usuário não autenticado' });
        }

        if (!gameId) {
            return res.status(400).json({ message: 'ID do jogo não fornecido' });
        }


        // Agora você tem o comment, gameId e userId, pode prosseguir com a lógica de salvar no banco de dados
        // Substitua o trecho a seguir com a lógica específica do seu banco de dados

        const [insertResults] = await req.locals.connection.execute(
            'INSERT INTO comments (comment, user, game) VALUES (?, ?, ?)',
            [comment, userId, gameId]
        );

        if (insertResults.affectedRows === 0) {
            return res.status(500).json({ message: 'Erro ao salvar o comentário' });
        }

        res.json({ message: 'Comentário salvo com sucesso' });

    } catch (error) {
        console.error('Erro ao salvar o comentário:', error);
        res.status(500).json({ message: 'Erro interno no servidor ao salvar o comentário' });
    }
});


// Rota para salvar usuário host
app.post('/api/userhost', async (req, res) => {
    const { nome, email, senha } = req.body;

    try {
        const connection = await createConnection();

        // Inserir os dados do usuário na tabela 'userhost' com senha em texto simples
        const [results] = await connection.execute('INSERT INTO users (name, email, password) VALUES (?, ?, ?)', [nome, email, senha]);

        // Redirecionar para '/grupo' após inserção bem-sucedida
        res.redirect('/login');
    } catch (err) {
        console.error('Erro no servidor:', err);
        res.status(500).json({ message: 'Erro no servidor' });
    }
});

app.get('/api/jogos', async (req, res) => {
    try {
        const connection = await mysql.createConnection(dbConfig);
        const [rows, fields] = await connection.execute('SELECT * FROM games');
        await connection.end();
        res.json(rows);
    } catch (error) {
        console.error('Erro ao buscar dados do banco de dados:', error);
        res.status(500).send('Erro interno do servidor');
    }
});

app.get('/cadastro', async (req, res) => {
    res.sendFile(path.join(__dirname, '/cadastro/index.html'));
});

app.get('/login', async (req, res) => {
    res.sendFile(path.join(__dirname, '/login/index.html'));
});

app.get('/shop', async (req, res) => {
    res.sendFile(path.join(__dirname, '/shop/index.html'));
});

app.get('/jogos', async (req, res) => {
    res.sendFile(path.join(__dirname, '/jogos/index.html'));
});
app.get('/conta', async (req, res) => {
    res.sendFile(path.join(__dirname, '/conta/index.html'));
});

app.get('/', async (req, res) => {
    res.sendFile(path.join(__dirname, '/jogos/index.html'));
});

// Rota para fechar a conexão ao final de cada requisição
app.use((req, res, next) => {
    if (req.locals.connection) {
        req.locals.connection.end();
    }
    next();
});

app.listen(port, () => {
    console.log(`Servidor Express rodando em http://localhost:${port}`);
});