import { Link, Route, Routes } from 'react-router';
import { AppMain, Heading } from '@mucsi96/react-ui';
import { Header } from './Header';
import { Databases } from './Databases';
import { Database } from './Database';
import styles from './App.module.css';

export function App() {
  return <div className={styles.layout}>
    <Header />
    <AppMain className={styles.main}>
      <Routes>
        <Route path="/" element={<Databases />} />
        <Route path="/database/:name" element={<Database />} />
        <Route path="*" element={<><Heading level={1}>Page not found</Heading><Link to="/">Databases</Link></>} />
      </Routes>
    </AppMain>
  </div>;
}
