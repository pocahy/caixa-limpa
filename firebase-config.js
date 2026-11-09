// Configuração do app Web do Firebase.
// Firebase Console > Configurações do projeto > Seus apps > App da Web > "Configuração do SDK" (objeto firebaseConfig).
// Esses valores são públicos por natureza: quem protege os dados são as regras do Firestore (firestore.rules).
// Enquanto estiver null, o app salva só no navegador.
window.FIREBASE_CONFIG = null;
/* Exemplo:
window.FIREBASE_CONFIG = {
  apiKey: "AIza...",
  authDomain: "seu-projeto.firebaseapp.com",
  projectId: "seu-projeto",
  storageBucket: "seu-projeto.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};
*/
