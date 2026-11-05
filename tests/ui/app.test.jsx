// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import App from '../../src/ui/App.jsx';

/** Faux sql.js : `exec` retourne les tuples fournis, quelle que soit la requête. */
function fakeSql(values) {
  return () =>
    Promise.resolve({
      Database: class {
        run() {
          return this;
        }
        exec() {
          return [{ columns: [], values }];
        }
        close() {}
      },
    });
}

const RECENT_BOOKS = [
  ['Hiver boréal', 'Tremblay'],
  ['Fragments de lumière', 'Morel'],
  ['Bases de données pour tous', 'Lefebvre'],
  ["Le Souffle de l'Atlas", 'Benali'],
];

const editor = () => screen.getByLabelText('Expression d’algèbre relationnelle');
/** Nœud de l'arbre (et non bouton de la barre de symboles) dont l'étiquette commence par `label`. */
const treeNode = (label) =>
  [...document.querySelectorAll('svg [role="button"]')].find((g) => {
    const description = g.getAttribute('aria-label') ?? '';
    return description === label || description.startsWith(`${label} · `);
  });

beforeEach(() => {
  window.location.hash = '';
});
afterEach(cleanup);

describe('interface', () => {
  it('affiche l’exemple de la base, son schéma, son arbre et la table du résultat', () => {
    render(<App />);
    expect(editor().value).toContain('Recents := σ[annee > 2020](Livre)');
    expect(screen.getByRole('heading', { name: 'Schéma' })).toBeTruthy();
    expect(
      within(screen.getByRole('region', { name: 'Schéma' })).getByText('Emprunt'),
    ).toBeTruthy();
    expect(treeNode('π[titre, nom]')).toBeTruthy();
    const table = screen.getByRole('table');
    expect(within(table).getByText('π[titre, nom]')).toBeTruthy();
    expect(within(table).getAllByRole('row')).toHaveLength(5);
    expect(screen.getByText('Étape 6 sur 6')).toBeTruthy();
  });

  it('affiche la table d’un nœud au clic et parcourt les étapes', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(treeNode('Livre'));
    expect(within(screen.getByRole('table')).getByText('Livre')).toBeTruthy();
    expect(screen.getByText('Étape 1 sur 6')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Étape précédente' }).disabled).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Étape suivante' }));
    expect(screen.getByText('Étape 2 sur 6')).toBeTruthy();
    expect(within(screen.getByRole('table')).getByText('σ[annee > 2020]')).toBeTruthy();
  });

  it('parcourt l’arbre au clavier', () => {
    render(<App />);
    const root = treeNode('π[titre, nom]');
    fireEvent.keyDown(root, { key: 'ArrowDown' });
    expect(treeNode('⋈').getAttribute('aria-pressed')).toBe('true');
    fireEvent.keyDown(treeNode('⋈'), { key: 'ArrowDown' });
    expect(treeNode('Recents').getAttribute('aria-pressed')).toBe('true');
    fireEvent.keyDown(treeNode('Recents'), { key: 'ArrowRight' });
    expect(treeNode('Auteur').getAttribute('aria-pressed')).toBe('true');
    fireEvent.keyDown(treeNode('Auteur'), { key: 'ArrowUp' });
    expect(treeNode('⋈').getAttribute('aria-pressed')).toBe('true');
  });

  it('signale une erreur de syntaxe avec sa ligne et sa colonne', () => {
    render(<App />);
    fireEvent.change(editor(), { target: { value: 'σ[annee > 2020(Livre)' } });
    expect(screen.getByRole('alert').textContent).toBe(
      'Erreur de syntaxe (Ligne 1, colonne 15) : « ] » attendu pour fermer la condition de σ, trouvé « ( ».',
    );
    expect(editor().getAttribute('aria-invalid')).toBe('true');
  });

  it('signale une erreur de schéma et garde l’arbre', () => {
    render(<App />);
    fireEvent.change(editor(), { target: { value: 'σ[anne > 2020](Livre)' } });
    expect(screen.getByRole('alert').textContent).toContain('Erreur de schéma');
    expect(screen.getByRole('alert').textContent).toContain('Vouliez-vous dire « annee » ?');
    expect(treeNode('σ[anne > 2020]')).toBeTruthy();
  });

  it('insère un symbole à la position du curseur', async () => {
    const user = userEvent.setup();
    render(<App />);
    fireEvent.change(editor(), { target: { value: 'Livre  Auteur' } });
    editor().setSelectionRange(6, 6);
    await user.click(screen.getByRole('button', { name: '⋈ join' }));
    expect(editor().value).toBe('Livre  ⋈  Auteur');
  });

  it('insère un symbole avec un raccourci clavier', () => {
    render(<App />);
    fireEvent.change(editor(), { target: { value: '' } });
    fireEvent.keyDown(editor(), { key: 'ß', code: 'KeyS', altKey: true });
    expect(editor().value).toBe('σ[]()');
  });

  it('change de base, d’exemple et d’adresse', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.selectOptions(screen.getByLabelText('Base de données'), 'universite');
    expect(editor().value).toContain('Génie logiciel');
    expect(
      within(screen.getByRole('region', { name: 'Schéma' })).getByText('Inscription'),
    ).toBeTruthy();
    expect(window.location.hash).toContain('db=universite');
  });

  it('reprend l’exercice encodé dans l’adresse', () => {
    window.location.hash = '#db=commerce&q=Client';
    render(<App />);
    expect(screen.getByLabelText('Base de données').value).toBe('commerce');
    expect(editor().value).toBe('Client');
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(8);
  });

  it('affiche un avertissement pour une jointure naturelle sans attribut commun', () => {
    render(<App />);
    fireEvent.change(editor(), { target: { value: 'π[titre](Livre) ⋈ π[nom](Auteur)' } });
    expect(screen.getByText(/équivaut à un produit cartésien/)).toBeTruthy();
  });

  it('montre le SQL et confirme que SQLite trouve le même résultat', async () => {
    const user = userEvent.setup();
    render(<App loadSql={fakeSql(RECENT_BOOKS)} />);
    await user.click(screen.getByRole('tab', { name: 'SQL' }));
    expect(screen.getByText(/WITH/)).toBeTruthy();
    expect(
      await screen.findByText('✓ Résultats identiques : SQLite retrouve les 4 tuple(s) du moteur.'),
    ).toBeTruthy();
  });

  it('liste les différences si SQLite trouve un autre résultat', async () => {
    const user = userEvent.setup();
    render(<App loadSql={fakeSql([...RECENT_BOOKS.slice(1), ['Autre', 'X']])} />);
    await user.click(screen.getByRole('tab', { name: 'SQL' }));
    expect(await screen.findByText('✗ Les résultats diffèrent.')).toBeTruthy();
    expect(screen.getByText('Hiver boréal')).toBeTruthy();
    expect(screen.getByText('Autre')).toBeTruthy();
  });

  it('signale un échec de chargement de SQLite', async () => {
    const user = userEvent.setup();
    render(<App loadSql={() => Promise.reject(new Error('réseau'))} />);
    await user.click(screen.getByRole('tab', { name: 'SQL' }));
    expect(
      await screen.findByText('Impossible d’exécuter la requête avec SQLite : réseau'),
    ).toBeTruthy();
  });

  it('affiche un état vide pour un programme vide', () => {
    render(<App />);
    fireEvent.change(editor(), { target: { value: '-- rien' } });
    expect(screen.getByText('Saisissez une expression pour afficher son arbre.')).toBeTruthy();
  });

  it('propose un exercice, vérifie la réponse et affiche la solution', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.selectOptions(screen.getByLabelText('Exercice'), 'livres-recents');
    expect(screen.getByText('Donnez le titre des livres publiés après 2020.')).toBeTruthy();
    expect(window.location.hash).toContain('ex=livres-recents');

    await user.click(screen.getByRole('button', { name: 'Vérifier ma réponse' }));
    expect(screen.getByText(/Corrigez d’abord l’expression/)).toBeTruthy();

    fireEvent.change(editor(), { target: { value: 'π[titre](Livre)' } });
    await user.click(screen.getByRole('button', { name: 'Vérifier ma réponse' }));
    expect(
      screen.getByText(/Pas encore : le résultat attendu contient 4 tuple\(s\), le vôtre 13/),
    ).toBeTruthy();

    fireEvent.change(editor(), { target: { value: 'π[titre](σ[annee >= 2021](Livre))' } });
    expect(screen.queryByText(/Pas encore/)).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Vérifier ma réponse' }));
    expect(screen.getByText(/Bonne réponse/)).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Afficher la solution' }));
    expect(editor().value).toBe('-- Livres récents\nπ[titre](σ[annee > 2020](Livre))');

    await user.selectOptions(screen.getByLabelText('Exercice'), '');
    expect(window.location.hash).not.toContain('ex=');
  });

  it('reprend l’exercice encodé dans l’adresse', () => {
    window.location.hash = '#db=universite&ex=bonnes-notes&q=Etudiant';
    render(<App />);
    expect(screen.getByLabelText('Exercice').value).toBe('bonnes-notes');
    expect(screen.getByText(/Pour chaque note de 85 ou plus/)).toBeTruthy();
  });
});
