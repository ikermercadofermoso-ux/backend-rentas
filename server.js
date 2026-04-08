console.log("🔥 SERVER REAL FUNCIONANDO 🔥");

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const mongoose = require('mongoose');

// 🔥 CONEXIÓN A MONGODB
mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log("🔥 MongoDB conectado");
    })
    .catch(err => {
        console.error("❌ Error Mongo:", err.message);
    });
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { PDFDocument, StandardFonts } = require('pdf-lib');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// 🔥 MONGODB CONNECTION
// ============================================

mongoose.connect('mongodb+srv://ikermercadofermoso_db_user:MsTS4ouERfWGQqxf@cluster0.wb1roef.mongodb.net/rentas')
  .then(() => console.log('🔥 MongoDB conectado'))
  .catch(err => console.log(err));

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
    ...{},
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
// INIT USERS (solo si no existen)
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
    const autos = await Auto.find();
    res.json(autos);
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
// CONTRATOS
// ============================================

app.get('/contratos', authMiddleware, async (req, res) => {
    const contratos = await Contrato.find();
    res.json(contratos);
});

app.post('/contratos', authMiddleware, async (req, res) => {
    const newContract = await Contrato.create({
        ...req.body,
        createdAt: new Date().toISOString()
    });

    res.status(201).json(newContract);
});

app.put('/contratos/:id/status', authMiddleware, async (req, res) => {
    const contract = await Contrato.findById(req.params.id);

    if (!contract) return res.status(404).json({ error: 'No encontrado' });

    contract.status = req.body.status;
    await contract.save();

    res.json(contract);
});

// ============================================
// CLIENTES
// ============================================

app.get('/clientes', authMiddleware, async (req, res) => {
    const clientes = await Cliente.find();
    res.json(clientes);
});

// ============================================
// STATS
// ============================================

app.get('/stats', authMiddleware, async (req, res) => {
    const autos = await Auto.find();
    const contratos = await Contrato.find();
    const clientes = await Cliente.find();

    res.json({
        totalVehiculos: autos.length,
        vehiculosDisponibles: autos.filter(v => v.status === 'available').length,
        vehiculosRentados: autos.filter(v => v.status === 'rented').length,
        totalContratos: contratos.length,
        contratosActivos: contratos.filter(c => c.status === 'active').length,
        totalClientes: clientes.length,
        ingresosTotales: contratos.reduce((sum, c) => sum + (c.total || 0), 0)
    });
});

// ============================================
// PDF
// ============================================

const CONTRACTS_DIR = path.join(__dirname, 'contracts');
if (!fs.existsSync(CONTRACTS_DIR)) fs.mkdirSync(CONTRACTS_DIR, { recursive: true });

app.post('/generate-contract-pdf', authMiddleware, async (req, res) => {
    try {
        const pdfDoc = await PDFDocument.create();
        const page = pdfDoc.addPage();
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

        page.drawText(`Cliente: ${req.body.clientName}`, { x: 50, y: 700, size: 12, font });
        page.drawText(`Placas: ${req.body.vehiclePlates}`, { x: 50, y: 680, size: 12, font });

        const pdfBytes = await pdfDoc.save();

        const filename = `Contrato_${Date.now()}.pdf`;
        const filepath = path.join(CONTRACTS_DIR, filename);

        fs.writeFileSync(filepath, pdfBytes);

        res.json({ url: `/contracts/${filename}` });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error generando PDF' });
    }
});

app.get('/contracts/:file', authMiddleware, (req, res) => {
    const file = path.join(CONTRACTS_DIR, req.params.file);

    if (!fs.existsSync(file)) {
        return res.status(404).send('No encontrado');
    }

    res.sendFile(file);
});

// ============================================
// ROOT
// ============================================

app.get('/', (req, res) => {
    res.send('🚀 Backend de CRONIC con MongoDB funcionando');
});

// ============================================
// START
// ============================================

app.listen(PORT, () => {
    console.log(`🔥 Servidor corriendo en puerto ${PORT}`);
});