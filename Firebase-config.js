// Configuración de Firebase - REEMPLAZA CON TUS DATOS
const firebaseConfig = {
    apiKey: "AIzaSyBwccZj6pnpcRDmDMacIYHEtNIlFuEpHWc",
  authDomain: "isnp1131-registros.firebaseapp.com",
  projectId: "isnp1131-registros",
  storageBucket: "isnp1131-registros.firebasestorage.app",
  messagingSenderId: "751672866310",
  appId: "1:751672866310:web:078b08a62becde0bc77587"
};

// Inicializar Firebase
firebase.initializeApp(firebaseConfig);

// Servicios globales
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();
