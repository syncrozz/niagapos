import firebaseAppletConfig from '../../firebase-applet-config.json';

export interface FirebaseConfig {
  projectId: string;
  appId: string;
  apiKey: string;
  authDomain: string;
  firestoreDatabaseId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  measurementId?: string;
}

export const firebaseConfig: FirebaseConfig = firebaseAppletConfig;
