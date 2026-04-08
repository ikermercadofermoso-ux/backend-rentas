console.log("🔥 SERVER REAL FUNCIONANDO 🔥");

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const mongoose = require('mongoose');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { PDFDocument, StandardFonts } = require('pdf-lib');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// 🔥 CONEXIÓN A MONGODB (SOLO UNA VEZ)
// ============================================

mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log("🔥 MongoDB conectado");
    })
    .catch(err => {
        console.error("❌ Error Mongo:", err.message);
    });

// ============================================
// MODELOS
// ============================================

const User = mongoose.model('User', new mongoose.Schema({
    username: String,
    password: String,
    role: String,
    nombre: String
}));

const Auto = mongoose.model('Auto', new mongoose.Schema({
    marca: String,
    modelo: String,
    placas: String,
    status: String
}));

const Contrato = mongoose.model('Contrato', new mongoose.Schema({
    createdAt: String,
    status: String,
    total: Number
}, { strict: false }));

const Cliente = mongoose.model('Cliente', new mongoose.Schema({}, { strict: false }));

const Token = mongoose.model('Token', new mongoose.Schema({
    token: String,
    userId: mongoose.Schema.Types.ObjectId
}));

// ============================================
// MIDDLEWARE
// ============================================

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ============================================
// INIT USERS
// ============================================

async function initUsers() {
    const count = await User.countDocuments();
    if (count === 0) {
        await User.insertMany([
            { username: 'admin', password: '654321', role: 'admin', nombre: 'Administrador' },
            { username: 'empleado', password: '123456', role: 'empleado', nombre: 'Empleado' }
        ]);
        console.log('🔥 Usuarios iniciales creados');
    }
}
initUsers();

// ============================================
// AUTH
// ============================================

function generateToken() {
    return uuidv4();
}

app.post('/login', async (req, res) => {
    const { username, password } = req.body;

    const user = await User.findOne({ username, password });

    if (!user) {
        return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const token = generateToken();

    await Token.create({ token, userId: user._id });

    res.json({
        success: true,
        token,
        usuario: user
    });
});

app.post('/verify-token', async (req, res) => {
    const { token } = req.body;

    const tokenRecord = await Token.findOne({ token });

    if (!tokenRecord) {
        return res.json({ valid: false });
    }

    const user = await User.findById(tokenRecord.userId);

    res.json({
        valid: true,
        usuario: user
    });
});

async function authMiddleware(req, res, next) {
    const publicRoutes = ['/login', '/test', '/verify-token'];

    if (publicRoutes.includes(req.path)) return next();

    const token = req.headers.authorization;

    if (!token) return res.status(401).json({ error: 'Token requerido' });

    const exists = await Token.findOne({ token });

    if (!exists) return res.status(401).json({ error: 'Token inválido' });

    next();
}

// ============================================
// RUTA TEST
// ============================================

app.get('/test', (req, res) => {
    res.send('Servidor funcionando 🔥');
});

// ============================================
// VEHÍCULOS
// ============================================

app.get('/autos', authMiddleware, async (req, res) => {
    res.json(await Auto.find());
});

app.post('/autos', authMiddleware, async (req, res) => {
    const newVehicle = await Auto.create({
        ...req.body,
        status: 'available'
    });

    res.status(201).json(newVehicle);
});

app.put('/autos/:id', authMiddleware, async (req, res) => {
    const vehicle = await Auto.findById(req.params.id);

    if (!vehicle) return res.status(404).json({ error: 'No encontrado' });

    vehicle.status = req.body.status;
    await vehicle.save();

    res.json(vehicle);
});

app.delete('/autos/:id', authMiddleware, async (req, res) => {
    await Auto.findByIdAndDelete(req.params.id);
    res.json({ success: true });
});

// ============================================
// START
// ============================================

app.listen(PORT, () => {
    console.log(`🔥 Servidor corriendo en puerto ${PORT}`);
});