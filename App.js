// ========================================
// APP PRINCIPAL CON FIREBASE - Versión para alumnos
// ========================================

// Variables globales
let currentUser = null;               // usuario logueado
let registros = [];                   // copia local de los registros (para filtrar rápido)
let currentFilter = 'all';             // filtro activo
let searchTerm = '';                   // término de búsqueda

// Archivos temporales (antes de subirlos)
let pendingAttachments = [];      // para nuevo registro
let editPendingAttachments = [];  // para edición

// ========================================
// INICIO - Cuando la página carga
// ========================================
document.addEventListener('DOMContentLoaded', () => {
    console.log('App iniciada');
    configurarEventos();
    // Escuchar cambios en el estado de autenticación
    auth.onAuthStateChanged(usuario => {
        if (usuario) {
            // Hay usuario logueado
            db.collection('usuarios').doc(usuario.uid).get().then(doc => {
                if (doc.exists) {
                    currentUser = { uid: usuario.uid, ...doc.data() };
                } else {
                    // Si no existe, creamos un perfil básico
                    currentUser = {
                        uid: usuario.uid,
                        name: usuario.email.split('@')[0], // nombre temporal
                        email: usuario.email,
                        role: 'user'
                    };
                    db.collection('usuarios').doc(usuario.uid).set(currentUser);
                }
                mostrarPantalla('main');
                actualizarUI();
                escucharRegistrosEnVivo();
            });
        } else {
            // No hay usuario
            currentUser = null;
            mostrarPantalla('login');
            if (window.dejarDeEscuchar) window.dejarDeEscuchar(); // cancelar suscripción anterior
        }
    });
});

// Escuchar cambios en los registros (tiempo real)
function escucharRegistrosEnVivo() {
    if (!currentUser) return;

    let consulta = db.collection('registros');
    if (currentUser.role !== 'admin') {
        consulta = consulta.where('registeringUserId', '==', currentUser.uid);
    }
    consulta = consulta.orderBy('createdAt', 'desc');

    // Guardamos la función para poder cancelarla después
    window.dejarDeEscuchar = consulta.onSnapshot(snapshot => {
        registros = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderizarRegistros();
        actualizarEstadisticasPerfil();
    }, error => {
        console.error('Error en snapshot:', error);
        mostrarMensaje('Error al cargar datos en tiempo real', 'error');
    });
}

// ========================================
// CONFIGURAR BOTONES Y FORMULARIOS
// ========================================
function configurarEventos() {
    // Tabs de login
    document.getElementById('tab-login').addEventListener('click', () => {
        document.getElementById('tab-login').classList.add('active');
        document.getElementById('tab-register').classList.remove('active');
        document.getElementById('login-form').classList.remove('hidden');
        document.getElementById('register-form').classList.add('hidden');
    });

    document.getElementById('tab-register').addEventListener('click', () => {
        document.getElementById('tab-register').classList.add('active');
        document.getElementById('tab-login').classList.remove('active');
        document.getElementById('register-form').classList.remove('hidden');
        document.getElementById('login-form').classList.add('hidden');
    });

    document.getElementById('login-form').addEventListener('submit', manejarLogin);
    document.getElementById('register-form').addEventListener('submit', manejarRegistro);
    document.getElementById('new-registro-form').addEventListener('submit', manejarNuevoRegistro);
    document.getElementById('edit-registro-form').addEventListener('submit', manejarEdicionRegistro);

    document.getElementById('fab-add').addEventListener('click', abrirModalNuevo);
    document.getElementById('nav-home').addEventListener('click', () => mostrarPantalla('main'));
    document.getElementById('nav-stats').addEventListener('click', mostrarEstadisticas);
    document.getElementById('nav-export').addEventListener('click', exportarCSV);
    document.getElementById('nav-profile').addEventListener('click', () => mostrarPantalla('profile'));

    document.getElementById('search-input').addEventListener('input', e => {
        searchTerm = e.target.value.trim();
        renderizarRegistros();
    });

    document.querySelectorAll('.filter-chip').forEach(chip => {
        chip.addEventListener('click', e => {
            document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
            e.target.classList.add('active');
            currentFilter = e.target.dataset.filter;
            renderizarRegistros();
        });
    });

    // Adjuntos para nuevo registro
    document.getElementById('btn-select-files').addEventListener('click', () => {
        document.getElementById('file-input').click();
    });
    document.getElementById('btn-take-photo').addEventListener('click', () => {
        document.getElementById('camera-input').click();
    });
    document.getElementById('file-input').addEventListener('change', (e) => {
        manejarSeleccionArchivos(e, pendingAttachments, 'file-list-container');
    });
    document.getElementById('camera-input').addEventListener('change', (e) => {
        manejarSeleccionArchivos(e, pendingAttachments, 'file-list-container');
    });

    // Adjuntos para edición
    document.getElementById('edit-btn-select-files').addEventListener('click', () => {
        document.getElementById('edit-file-input').click();
    });
    document.getElementById('edit-btn-take-photo').addEventListener('click', () => {
        document.getElementById('edit-camera-input').click();
    });
    document.getElementById('edit-file-input').addEventListener('change', (e) => {
        manejarSeleccionArchivos(e, editPendingAttachments, 'edit-file-list-container');
    });
    document.getElementById('edit-camera-input').addEventListener('change', (e) => {
        manejarSeleccionArchivos(e, editPendingAttachments, 'edit-file-list-container');
    });
}

// ========================================
// AUTENTICACIÓN
// ========================================
async function manejarLogin(e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;

    try {
        mostrarCargando('Iniciando sesión...');
        await auth.signInWithEmailAndPassword(email, password);
        ocultarCargando();
        document.getElementById('login-form').reset();
    } catch (error) {
        ocultarCargando();
        mostrarMensaje(error.message, 'error');
    }
}

async function manejarRegistro(e) {
    e.preventDefault();
    const name = document.getElementById('reg-name').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;

    if (password.length < 6) {
        mostrarMensaje('La contraseña debe tener al menos 6 caracteres', 'warning');
        return;
    }

    try {
        mostrarCargando('Creando cuenta...');
        const cred = await auth.createUserWithEmailAndPassword(email, password);
        // Guardar datos adicionales en Firestore
        await db.collection('usuarios').doc(cred.user.uid).set({
            name,
            email,
            role: 'user',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        ocultarCargando();
        mostrarMensaje('Cuenta creada exitosamente', 'success');
        // Cambiar a pestaña de login
        document.getElementById('tab-login').click();
        document.getElementById('register-form').reset();
    } catch (error) {
        ocultarCargando();
        mostrarMensaje(error.message, 'error');
    }
}

function cerrarSesion() {
    if (confirm('¿Cerrar sesión?')) {
        auth.signOut();
    }
}

// ========================================
// GESTIÓN DE REGISTROS
// ========================================
async function manejarNuevoRegistro(e) {
    e.preventDefault();

    const docType = document.getElementById('new-docType').value;
    const deliveryPerson = document.getElementById('new-deliveryPerson').value.trim();
    const originArea = document.getElementById('new-originArea').value.trim();
    const userId = document.getElementById('new-userId').value.trim();
    const observations = document.getElementById('new-observations').value.trim();

    if (!docType || !deliveryPerson) {
        mostrarMensaje('Complete los campos obligatorios', 'warning');
        return;
    }

    mostrarCargando('Guardando registro y subiendo archivos...');

    try {
        // 1. Subir archivos a Storage y obtener URLs
        const attachments = await Promise.all(pendingAttachments.map(async archivo => {
            const filePath = `attachments/${currentUser.uid}/${Date.now()}_${archivo.name}`;
            const ref = storage.ref().child(filePath);
            // Convertir base64 a blob
            const respuesta = await fetch(archivo.data);
            const blob = await respuesta.blob();
            await ref.put(blob);
            const url = await ref.getDownloadURL();
            return {
                name: archivo.name,
                size: archivo.size,
                type: archivo.type,
                url: url
            };
        }));

        // 2. Generar número de registro
        const regNumber = await generarNumeroRegistro(docType);

        // 3. Guardar en Firestore
        await db.collection('registros').add({
            regNumber,
            date: new Date().toISOString().split('T')[0],
            time: new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
            docType,
            deliveryPerson,
            originArea: originArea || '',
            userId: userId || '',
            observations: observations || '',
            registeringUserId: currentUser.uid,
            registeringUserName: currentUser.name,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            attachments
        });

        ocultarCargando();
        mostrarMensaje(`Registro ${regNumber} creado`, 'success');
        cerrarModalNuevo();
        document.getElementById('new-registro-form').reset();
        pendingAttachments = [];
        renderizarListaArchivos(pendingAttachments, 'file-list-container');
    } catch (error) {
        ocultarCargando();
        mostrarMensaje('Error: ' + error.message, 'error');
    }
}

async function manejarEdicionRegistro(e) {
    e.preventDefault();

    const id = document.getElementById('edit-registro-id').value;
    const docType = document.getElementById('edit-docType').value;
    const deliveryPerson = document.getElementById('edit-deliveryPerson').value.trim();
    const originArea = document.getElementById('edit-originArea').value.trim();
    const userId = document.getElementById('edit-userId').value.trim();
    const observations = document.getElementById('edit-observations').value.trim();

    if (!docType || !deliveryPerson) {
        mostrarMensaje('Complete campos obligatorios', 'warning');
        return;
    }

    mostrarCargando('Actualizando...');

    try {
        // Archivos viejos (los que ya estaban en el registro)
        const registroViejo = registros.find(r => r.id === id);
        const viejos = registroViejo?.attachments || [];

        // Archivos nuevos (los que se agregaron ahora y no tienen URL)
        const nuevos = editPendingAttachments.filter(a => !a.url);

        // Subir los nuevos
        const subidos = await Promise.all(nuevos.map(async archivo => {
            const filePath = `attachments/${currentUser.uid}/${Date.now()}_${archivo.name}`;
            const ref = storage.ref().child(filePath);
            const respuesta = await fetch(archivo.data);
            const blob = await respuesta.blob();
            await ref.put(blob);
            const url = await ref.getDownloadURL();
            return {
                name: archivo.name,
                size: archivo.size,
                type: archivo.type,
                url: url
            };
        }));

        // Combinar viejos + nuevos
        const attachmentsFinal = [...viejos, ...subidos];

        await db.collection('registros').doc(id).update({
            docType,
            deliveryPerson,
            originArea,
            userId,
            observations,
            attachments: attachmentsFinal
        });

        ocultarCargando();
        mostrarMensaje('Registro actualizado', 'success');
        cerrarModalEdicion();
        editPendingAttachments = [];
    } catch (error) {
        ocultarCargando();
        mostrarMensaje('Error: ' + error.message, 'error');
    }
}

// Generar número correlativo por tipo (ej: NTA-001-2026)
async function generarNumeroRegistro(tipo) {
    const prefijo = obtenerAbreviaturaTipo(tipo);
    const año = new Date().getFullYear();
    const snapshot = await db.collection('registros')
        .where('docType', '==', tipo)
        .where('date', '>=', `${año}-01-01`)
        .where('date', '<=', `${año}-12-31`)
        .get();
    const cantidad = snapshot.size + 1;
    return `${prefijo}-${String(cantidad).padStart(3, '0')}-${año}`;
}

// ========================================
// VISUALIZACIÓN DE REGISTROS
// ========================================
function renderizarRegistros() {
    const contenedor = document.getElementById('registros-list');
    let filtrados = registros.filter(r => {
        if (currentFilter !== 'all' && r.docType !== currentFilter) return false;
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            return r.regNumber.toLowerCase().includes(term) ||
                   r.deliveryPerson.toLowerCase().includes(term) ||
                   (r.originArea && r.originArea.toLowerCase().includes(term));
        }
        return true;
    });

    if (filtrados.length === 0) {
        contenedor.innerHTML = `<div class="empty-state"><div class="empty-icon">📋</div><div class="empty-text">No hay registros</div></div>`;
        return;
    }

    contenedor.innerHTML = filtrados.map(r => `
        <div class="registro-card" onclick="verDetalle('${r.id}')">
            <div class="registro-header">
                <div class="registro-number">
                    ${r.regNumber}
                    ${r.attachments?.length ? '<span class="attachment-icon">📎</span>' : ''}
                </div>
                <div class="registro-badge" style="background:${obtenerColorTipo(r.docType)}">
                    ${obtenerNombreTipo(r.docType)}
                </div>
            </div>
            <div class="registro-info">
                <div class="info-item"><span class="info-label">Fecha</span><span class="info-value">${formatearFecha(r.date)}</span></div>
                <div class="info-item"><span class="info-label">Hora</span><span class="info-value">${r.time}</span></div>
                <div class="info-item"><span class="info-label">Personal</span><span class="info-value">${r.deliveryPerson}</span></div>
                <div class="info-item"><span class="info-label">Área</span><span class="info-value">${r.originArea || '-'}</span></div>
            </div>
        </div>
    `).join('');
}

// Función global para que el onclick funcione
window.verDetalle = function(id) {
    const r = registros.find(x => x.id === id);
    if (!r) return;

    let adjuntosHtml = '';
    if (r.attachments?.length) {
        adjuntosHtml = '<div class="mb-2"><div class="info-label">Adjuntos</div>';
        r.attachments.forEach(a => {
            adjuntosHtml += `<a href="${a.url}" target="_blank" class="attachment-download">📄 ${a.name} (${Math.round(a.size/1024)} KB)</a>`;
        });
        adjuntosHtml += '</div>';
    }

    let botonesAccion = '';
    if (currentUser.role === 'admin' || r.registeringUserId === currentUser.uid) {
        botonesAccion = `
            <div style="display:flex; gap:10px; margin-top:20px;">
                <button class="btn btn-warning" onclick="editarRegistro('${r.id}')" style="flex:1;">✏️ Editar</button>
                <button class="btn btn-danger" onclick="eliminarRegistro('${r.id}')" style="flex:1;">🗑️ Eliminar</button>
            </div>
        `;
    }

    document.getElementById('detail-content').innerHTML = `
        <div class="mb-2"><h4>${r.regNumber}</h4><span class="registro-badge" style="background:${obtenerColorTipo(r.docType)};display:inline-block">${obtenerNombreTipo(r.docType)}</span></div>
        <div class="info-item mb-2"><span class="info-label">Fecha y hora</span><span class="info-value">${formatearFecha(r.date)} ${r.time}</span></div>
        <div class="info-item mb-2"><span class="info-label">Personal</span><span class="info-value">${r.deliveryPerson}</span></div>
        <div class="info-item mb-2"><span class="info-label">Área</span><span class="info-value">${r.originArea || '-'}</span></div>
        <div class="info-item mb-2"><span class="info-label">ID Usuario</span><span class="info-value">${r.userId || '-'}</span></div>
        <div class="info-item mb-2"><span class="info-label">Observaciones</span><span class="info-value">${r.observations || '-'}</span></div>
        ${adjuntosHtml}
        <div class="info-item mb-2"><span class="info-label">Registrado por</span><span class="info-value">${r.registeringUserName}</span></div>
        ${botonesAccion}
    `;

    document.getElementById('detail-modal').classList.add('active');
};

window.editarRegistro = function(id) {
    const r = registros.find(x => x.id === id);
    if (!r) return;

    document.getElementById('edit-registro-id').value = r.id;
    document.getElementById('edit-docType').value = r.docType;
    document.getElementById('edit-deliveryPerson').value = r.deliveryPerson;
    document.getElementById('edit-originArea').value = r.originArea || '';
    document.getElementById('edit-userId').value = r.userId || '';
    document.getElementById('edit-observations').value = r.observations || '';

    // Cargar archivos existentes (solo metadata, sin data)
    editPendingAttachments = r.attachments ? r.attachments.map(a => ({ ...a, data: null })) : [];
    renderizarListaArchivos(editPendingAttachments, 'edit-file-list-container');

    document.getElementById('edit-registro-modal').classList.add('active');
};

window.eliminarRegistro = async function(id) {
    if (!confirm('¿Eliminar este registro?')) return;

    try {
        mostrarCargando('Eliminando...');
        await db.collection('registros').doc(id).delete();
        ocultarCargando();
        mostrarMensaje('Registro eliminado', 'success');
        cerrarModalDetalle();
    } catch (error) {
        ocultarCargando();
        mostrarMensaje(error.message, 'error');
    }
};

// ========================================
// ARCHIVOS ADJUNTOS (pendientes)
// ========================================
function manejarSeleccionArchivos(event, listaAdjuntos, idContenedor) {
    const archivos = Array.from(event.target.files);
    if (archivos.length === 0) return;

    const MAX_TAMANO = 5 * 1024 * 1024; // 5MB
    let totalActual = listaAdjuntos.reduce((acc, f) => acc + (f.size || 0), 0);

    archivos.forEach(archivo => {
        if (archivo.size > MAX_TAMANO) {
            mostrarMensaje(`El archivo ${archivo.name} excede 5MB`, 'warning');
            return;
        }
        if (totalActual + archivo.size > 20 * 1024 * 1024) {
            mostrarMensaje('Tamaño total excede 20MB', 'warning');
            return;
        }
        totalActual += archivo.size;

        const lector = new FileReader();
        lector.onload = (e) => {
            listaAdjuntos.push({
                name: archivo.name,
                size: archivo.size,
                type: archivo.type,
                data: e.target.result // base64
            });
            renderizarListaArchivos(listaAdjuntos, idContenedor);
        };
        lector.readAsDataURL(archivo);
    });

    event.target.value = '';
}

function renderizarListaArchivos(lista, idContenedor) {
    const contenedor = document.getElementById(idContenedor);
    if (lista.length === 0) {
        contenedor.style.display = 'none';
        contenedor.innerHTML = '';
        return;
    }
    contenedor.style.display = 'block';
    contenedor.innerHTML = lista.map((archivo, index) => {
        const tamañoKB = Math.round((archivo.size || 0) / 1024);
        // Determinamos si es un archivo nuevo (tiene data) o existente (no tiene data)
        const textoEliminar = archivo.data ? 'Eliminar' : 'Quitar (no se borrará de Firebase)';
        return `
            <div class="file-item">
                <span class="file-name">📄 ${archivo.name}</span>
                <span class="file-size">${tamañoKB} KB</span>
                <button class="file-remove" onclick="eliminarArchivoTemporal(${index}, '${idContenedor}', '${idContenedor === 'file-list-container' ? 'nuevo' : 'editar'}')">×</button>
            </div>
        `;
    }).join('');
}

// Función global para eliminar de la lista temporal
window.eliminarArchivoTemporal = function(indice, idContenedor, modo) {
    if (modo === 'nuevo') {
        pendingAttachments.splice(indice, 1);
        renderizarListaArchivos(pendingAttachments, idContenedor);
    } else if (modo === 'editar') {
        editPendingAttachments.splice(indice, 1);
        renderizarListaArchivos(editPendingAttachments, idContenedor);
    }
};

// ========================================
// ESTADÍSTICAS Y PERFIL
// ========================================
function actualizarEstadisticasPerfil() {
    if (!currentUser || !registros) return;

    const misRegistros = currentUser.role === 'admin' ? registros : registros.filter(r => r.registeringUserId === currentUser.uid);
    const ahora = new Date();
    const esteMes = misRegistros.filter(r => {
        const d = new Date(r.date);
        return d.getMonth() === ahora.getMonth() && d.getFullYear() === ahora.getFullYear();
    });
    const estaSemana = misRegistros.filter(r => {
        const d = new Date(r.date);
        const hace7Dias = new Date(); hace7Dias.setDate(ahora.getDate() - 7);
        return d >= hace7Dias;
    });
    const caps = misRegistros.filter(r => r.docType === 'cap').length;

    document.getElementById('stat-total').textContent = misRegistros.length;
    document.getElementById('stat-month').textContent = esteMes.length;
    document.getElementById('stat-week').textContent = estaSemana.length;
    document.getElementById('stat-cap').textContent = caps;
}

function actualizarInfoPerfil() {
    if (!currentUser) return;
    document.getElementById('profile-username').textContent = currentUser.name;
    document.getElementById('profile-name').textContent = currentUser.name;
    document.getElementById('profile-email').textContent = currentUser.email;
    document.getElementById('profile-role').textContent = currentUser.role === 'admin' ? 'Administrador' : 'Usuario';
}

function mostrarEstadisticas() {
    if (!currentUser) return;
    const total = currentUser.role === 'admin' ? registros.length : registros.filter(r => r.registeringUserId === currentUser.uid).length;
    alert(`Total de registros: ${total}`);
}

// ========================================
// EXPORTACIONES
// ========================================
function exportarCSV() {
    let datos = registros;
    if (currentUser.role !== 'admin') datos = registros.filter(r => r.registeringUserId === currentUser.uid);
    if (datos.length === 0) return mostrarMensaje('Sin datos', 'warning');

    const cabeceras = ['N° Registro','Fecha','Hora','Tipo','Personal','Área','ID','Observaciones'];
    const filas = datos.map(r => [
        r.regNumber, r.date, r.time, obtenerNombreTipo(r.docType), r.deliveryPerson,
        r.originArea || '', r.userId || '', (r.observations || '').replace(/"/g,'""')
    ]);
    let csv = cabeceras.join(';') + '\n' + filas.map(f => f.map(c => `"${c}"`).join(';')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `registros_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    mostrarMensaje('CSV exportado', 'success');
}

window.exportToPDF = function() {
    let datos = registros;
    if (currentUser.role !== 'admin') datos = registros.filter(r => r.registeringUserId === currentUser.uid);
    if (datos.length === 0) return mostrarMensaje('Sin datos', 'warning');

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('landscape');
    doc.text('Inspección 1131 - Registros', 14, 15);
    doc.setFontSize(10);
    doc.text(`Exportado: ${new Date().toLocaleDateString()}`, 14, 22);

    const cabeceras = [['N°','Fecha','Hora','Tipo','Personal','Área','ID','Obs']];
    const cuerpo = datos.map(r => [
        r.regNumber, r.date, r.time, obtenerNombreTipo(r.docType), r.deliveryPerson,
        r.originArea || '-', r.userId || '-', (r.observations || '').substring(0,20)
    ]);
    doc.autoTable({
        head: cabeceras,
        body: cuerpo,
        startY: 30,
        theme: 'grid',
        styles: { fontSize: 7 },
        headStyles: { fillColor: [0,69,130] }
    });
    doc.save(`registros_${new Date().toISOString().split('T')[0]}.pdf`);
    mostrarMensaje('PDF exportado', 'success');
};

// ========================================
// UTILIDADES DE PANTALLA
// ========================================
function mostrarPantalla(nombre) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(`${nombre}-screen`).classList.add('active');

    if (nombre === 'main') {
        renderizarRegistros();
        activarNav('nav-home');
    } else if (nombre === 'profile') {
        actualizarInfoPerfil();
        actualizarEstadisticasPerfil();
        activarNav('nav-profile');
    }
}

function activarNav(id) {
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    document.getElementById(id)?.classList.add('active');
}

function actualizarUI() {
    if (!currentUser) return;
    document.getElementById('user-name-header').textContent = currentUser.name;
    renderizarRegistros();
}

function abrirModalNuevo() {
    pendingAttachments = [];
    renderizarListaArchivos(pendingAttachments, 'file-list-container');
    document.getElementById('new-registro-modal').classList.add('active');
}

function cerrarModalNuevo() {
    document.getElementById('new-registro-modal').classList.remove('active');
    pendingAttachments = [];
    renderizarListaArchivos(pendingAttachments, 'file-list-container');
}

function cerrarModalEdicion() {
    document.getElementById('edit-registro-modal').classList.remove('active');
    editPendingAttachments = [];
    renderizarListaArchivos(editPendingAttachments, 'edit-file-list-container');
}

function cerrarModalDetalle() {
    document.getElementById('detail-modal').classList.remove('active');
}

function mostrarCargando(texto = 'Cargando...') {
    document.getElementById('loading-text').textContent = texto;
    document.getElementById('loading-screen').classList.add('active');
}

function ocultarCargando() {
    document.getElementById('loading-screen').classList.remove('active');
}

function mostrarMensaje(texto, tipo = 'success') {
    const msg = document.getElementById(`message-${tipo}`);
    if (!msg) return;
    msg.textContent = texto;
    msg.style.display = 'block';
    setTimeout(() => msg.style.display = 'none', 3000);
}

// Funciones auxiliares para tipos de documentos
function obtenerNombreTipo(tipo) {
    const mapa = { nota:'Nota', informe:'Informe', expediente:'Expediente', acta:'Acta', circular:'Circular', cap:'CAP', otro:'Otro' };
    return mapa[tipo] || tipo;
}
function obtenerAbreviaturaTipo(tipo) {
    const mapa = { nota:'NTA', informe:'INF', expediente:'EXP', acta:'ACT', circular:'CIR', cap:'CAP', otro:'OTR' };
    return mapa[tipo] || tipo;
}
function obtenerColorTipo(tipo) {
    const mapa = { nota:'#009ADA', informe:'#AF4178', expediente:'#E2464C', acta:'#EB7F27', circular:'#F7BE2B', cap:'#32A430', otro:'#757575' };
    return mapa[tipo] || '#757575';
}
function formatearFecha(fechaStr) {
    if (!fechaStr) return '';
    const [y,m,d] = fechaStr.split('-');
    return `${d}/${m}/${y}`;
}

// Exponer funciones necesarias globalmente (para los onclick)
window.cerrarModalNuevo = cerrarModalNuevo;
window.cerrarModalEdicion = cerrarModalEdicion;
window.cerrarModalDetalle = cerrarModalDetalle;
window.mostrarPantalla = mostrarPantalla;
window.cerrarSesion = cerrarSesion;
window.mostrarEstadisticas = mostrarEstadisticas;
window.exportarCSV = exportarCSV;
