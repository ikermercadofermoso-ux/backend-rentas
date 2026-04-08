console.log("🔥 SERVER REAL FUNCIONANDO 🔥");

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { PDFDocument, StandardFonts } = require('pdf-lib');

const app = express();
const PORT = process.env.PORT || 3000;
// ============================================
// MIDDLEWARE
// ============================================

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ============================================
// RUTA TEST
// ============================================

app.get('/test', (req, res) => {
    res.send('Servidor funcionando 🔥');
});

// ============================================
// DIRECTORIOS
// ============================================

const CONTRACTS_DIR = path.join(__dirname, 'contracts');
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_FILE = path.join(__dirname, 'data.json');

if (!fs.existsSync(CONTRACTS_DIR)) fs.mkdirSync(CONTRACTS_DIR, { recursive: true });
if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR, { recursive: true });

// ============================================
// BASE DE DATOS (JSON)
// ============================================

let db = {
    usuarios: [
        { id: 1, username: 'admin', password: '654321', role: 'admin', nombre: 'Administrador' },
        { id: 2, username: 'empleado', password: '123456', role: 'empleado', nombre: 'Empleado' }
    ],
    autos: [],
    contratos: [],
    clientes: [],
    tokens: []
};

if (fs.existsSync(DATA_FILE)) {
    try {
        db = JSON.parse(fs.readFileSync(DATA_FILE));
    } catch (e) {
        console.error('Error leyendo data.json');
    }
}

function saveData() {
    fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

// ============================================
// AUTH
// ============================================

function generateToken() {
    return uuidv4();
}

// LOGIN CORRECTO
app.post('/login', (req, res) => {
    const { username, password } = req.body;

    const user = db.usuarios.find(u => u.username === username && u.password === password);

    if (!user) {
        return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const token = generateToken();

    db.tokens.push({ token, userId: user.id });
    saveData();

    res.json({
        success: true,
        token: token,
        usuario: user
    });
});

// VERIFY TOKEN
app.post('/verify-token', (req, res) => {
    const { token } = req.body;

    const tokenRecord = db.tokens.find(t => t.token === token);

    if (!tokenRecord) {
        return res.json({ valid: false });
    }

    const user = db.usuarios.find(u => u.id === tokenRecord.userId);

    res.json({
        valid: true,
        usuario: user
    });
});

// MIDDLEWARE
function authMiddleware(req, res, next) {
    const publicRoutes = ['/login', '/test', '/verify-token'];

    if (publicRoutes.includes(req.path)) return next();

    const token = req.headers.authorization;

    if (!token) return res.status(401).json({ error: 'Token requerido' });

    const exists = db.tokens.find(t => t.token === token);

    if (!exists) return res.status(401).json({ error: 'Token inválido' });

    next();
}

// ============================================
// VEHÍCULOS
// ============================================

app.get('/autos', authMiddleware, (req, res) => {
    res.json(db.autos);
});

app.post('/autos', authMiddleware, (req, res) => {
    const newVehicle = {
        id: Date.now(),
        ...req.body,
        status: 'available'
    };

    db.autos.push(newVehicle);
    saveData();

    res.status(201).json(newVehicle);
});

app.put('/autos/:id', authMiddleware, (req, res) => {
    const id = parseInt(req.params.id);
    const vehicle = db.autos.find(v => v.id === id);

    if (!vehicle) return res.status(404).json({ error: 'No encontrado' });

    vehicle.status = req.body.status;
    saveData();

    res.json(vehicle);
});

app.delete('/autos/:id', authMiddleware, (req, res) => {
    const id = parseInt(req.params.id);

    db.autos = db.autos.filter(v => v.id !== id);
    saveData();

    res.json({ success: true });
});

// ============================================
// CONTRATOS
// ============================================

app.get('/contratos', authMiddleware, (req, res) => {
    res.json(db.contratos);
});

app.post('/contratos', authMiddleware, (req, res) => {
    const newContract = {
        id: Date.now(),
        ...req.body,
        createdAt: new Date().toISOString()
    };

    db.contratos.push(newContract);
    saveData();

    res.status(201).json(newContract);
});

app.put('/contratos/:id/status', authMiddleware, (req, res) => {
    const id = parseInt(req.params.id);
    const contract = db.contratos.find(c => c.id === id);

    if (!contract) return res.status(404).json({ error: 'No encontrado' });

    contract.status = req.body.status;
    saveData();

    res.json(contract);
});

// ============================================
// CLIENTES
// ============================================

app.get('/clientes', authMiddleware, (req, res) => {
    res.json(db.clientes);
});

// ============================================
// ESTADÍSTICAS
// ============================================

app.get('/stats', authMiddleware, (req, res) => {
    const totalVehiculos = db.autos.length;
    const vehiculosDisponibles = db.autos.filter(v => v.status === 'available').length;
    const vehiculosRentados = db.autos.filter(v => v.status === 'rented').length;
    const totalContratos = db.contratos.length;
    const contratosActivos = db.contratos.filter(c => c.status === 'active').length;
    const totalClientes = db.clientes.length;
    const ingresosTotales = db.contratos.reduce((sum, c) => sum + (c.total || 0), 0);

    res.json({
        totalVehiculos,
        vehiculosDisponibles,
        vehiculosRentados,
        totalContratos,
        contratosActivos,
        totalClientes,
        ingresosTotales
    });
});

// ============================================
// PDF SIMPLE
// ============================================

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

        res.json({
            url: `/contracts/${filename}`
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error generando PDF' });
    }
});

// SERVIR PDF
app.get('/contracts/:file', authMiddleware, (req, res) => {
    const file = path.join(CONTRACTS_DIR, req.params.file);

    if (!fs.existsSync(file)) {
        return res.status(404).send('No encontrado');
    }

    res.sendFile(file);
});

// ============================================
// START
// ============================================

app.get('/', (req, res) => {
    res.send('🚀 Backend de CRONIC funcionando correctamente');
});
app.listen(PORT, () => {
    console.log(`🔥 Servidor corriendo en puerto ${PORT}`);
    console.log(`📝 Credenciales:`);
    console.log(`   👑 admin / 654321`);
    console.log(`   👤 empleado / 123456`);
});