import { computePosition, flip, offset, shift } from '@floating-ui/dom';
import { Extension, type Editor } from '@tiptap/core';
import { ReactRenderer } from '@tiptap/react';
import Suggestion, { type SuggestionOptions } from '@tiptap/suggestion';
import {
  SlashCommandList,
  type SlashCommandItem,
  type SlashCommandListHandle,
} from '../components/SlashCommandList';
import { generateMathStructureLatex } from '../utils/mathTemplates';
import { insertAcademicBlockNode } from './AcademicBlock';
import { insertNewDrawingBlock } from './SoftExcalidraw';
import { insertFunctionPlotBlock } from './SoftFunctionPlot';
import { insertVariationTableBlock } from './SoftVariationTable';

function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function insertBlockNodeAtSelection(
  editor: Editor,
  nodeSpec: { type: string; attrs?: Record<string, unknown> },
  range?: { from: number; to: number }
): void {
  const nodesToInsert = [nodeSpec, { type: 'paragraph' }];
  if (range) {
    editor.chain().focus().insertContentAt(range, nodesToInsert).run();
    return;
  }

  const { $from } = editor.state.selection;
  const isEmptyParagraph =
    $from.parent.type.name === 'paragraph' && $from.parent.content.size === 0;

  if (isEmptyParagraph) {
    editor
      .chain()
      .focus()
      .insertContentAt(
        { from: $from.before($from.depth), to: $from.after($from.depth) },
        nodesToInsert
      )
      .run();
    return;
  }

  editor.chain().focus().insertContentAt($from.after($from.depth), nodesToInsert).run();
}

export const SLASH_COMMAND_ITEMS: SlashCommandItem[] = [
  {
    id: 'excalidraw',
    title: 'Dessin / Schéma',
    description: 'Schéma géométrique, graphe ou croquis Excalidraw',
    keywords: ['dessin', 'schema', 'schéma', 'excalidraw', 'graphe', 'figure', 'croquis'],
    badge: '/dessin',
    icon: 'drawing',
    run: ({ editor, range }) => {
      void insertNewDrawingBlock(editor as Editor, range);
    },
  },
  {
    id: 'blockMath',
    title: 'Bloc mathématique',
    description: 'Formule LaTeX centrée avec aperçu KaTeX',
    keywords: ['math', 'formule', 'equation', 'équation', 'latex', 'katex', 'bloc'],
    badge: '$$',
    icon: 'math',
    run: ({ editor, range }) => {
      insertBlockNodeAtSelection(
        editor as Editor,
        { type: 'blockMath', attrs: { latex: '' } },
        range
      );
    },
  },
  {
    id: 'h1',
    title: 'Titre 1',
    description: 'Grand titre de section',
    keywords: ['titre', 'heading', 'h1', 'section'],
    badge: '#',
    icon: 'h1',
    run: ({ editor, range }) => {
      const chain = (editor as Editor).chain().focus();
      if (range) {
        chain.deleteRange(range).setHeading({ level: 1 }).run();
      } else {
        chain.setHeading({ level: 1 }).run();
      }
    },
  },
  {
    id: 'h2',
    title: 'Titre 2',
    description: 'Sous-titre de section',
    keywords: ['titre', 'heading', 'h2', 'sous-titre'],
    badge: '##',
    icon: 'h2',
    run: ({ editor, range }) => {
      const chain = (editor as Editor).chain().focus();
      if (range) {
        chain.deleteRange(range).setHeading({ level: 2 }).run();
      } else {
        chain.setHeading({ level: 2 }).run();
      }
    },
  },
  {
    id: 'bulletList',
    title: 'Liste à puces',
    description: 'Liste simple à puces',
    keywords: ['liste', 'puces', 'bullet', 'ul'],
    badge: '-',
    icon: 'bulletList',
    run: ({ editor, range }) => {
      const chain = (editor as Editor).chain().focus();
      if (range) {
        chain.deleteRange(range).toggleBulletList().run();
      } else {
        chain.toggleBulletList().run();
      }
    },
  },
  {
    id: 'orderedList',
    title: 'Liste numérotée',
    description: 'Liste ordonnée étape par étape',
    keywords: ['liste', 'numerotee', 'numérotée', 'nombre', 'ol'],
    badge: '1.',
    icon: 'orderedList',
    run: ({ editor, range }) => {
      const chain = (editor as Editor).chain().focus();
      if (range) {
        chain.deleteRange(range).toggleOrderedList().run();
      } else {
        chain.toggleOrderedList().run();
      }
    },
  },
  {
    id: 'blockquote',
    title: 'Citation / Remarque',
    description: 'Bloc mis en avant pour théorème ou note',
    keywords: ['citation', 'quote', 'remarque', 'theoreme', 'théorème'],
    badge: '>',
    icon: 'quote',
    run: ({ editor, range }) => {
      const chain = (editor as Editor).chain().focus();
      if (range) {
        chain.deleteRange(range).toggleBlockquote().run();
      } else {
        chain.toggleBlockquote().run();
      }
    },
  },
  {
    id: 'codeBlock',
    title: 'Bloc de code',
    description: 'Extrait algorithmique ou script',
    keywords: ['code', 'script', 'algo', 'pre'],
    badge: '```',
    icon: 'code',
    run: ({ editor, range }) => {
      const chain = (editor as Editor).chain().focus();
      if (range) {
        chain.deleteRange(range).toggleCodeBlock().run();
      } else {
        chain.toggleCodeBlock().run();
      }
    },
  },
  {
    id: 'functionPlot',
    title: 'Graphe de fonction 2D',
    description: 'Courbes interactives f(x), dérivée et intégrale',
    keywords: ['graphe', 'courbe', 'plot', 'fonction', '2d', 'integrale'],
    badge: '/graphe',
    icon: 'plot',
    run: ({ editor, range }) => {
      const typedEditor = editor as Editor;
      if (range) {
        typedEditor.chain().focus().deleteRange(range).run();
      }
      insertFunctionPlotBlock(typedEditor);
    },
  },
  {
    id: 'variationTable',
    title: 'Tableau de variations / signes',
    description: 'Tableau interactif avec signes, flèches et doubles barres ||',
    keywords: ['tableau', 'variation', 'variations', 'signe', 'signes', 'borne'],
    badge: '/tableau',
    icon: 'variation',
    run: ({ editor, range }) => {
      const typedEditor = editor as Editor;
      if (range) {
        typedEditor.chain().focus().deleteRange(range).run();
      }
      insertVariationTableBlock(typedEditor);
    },
  },
  {
    id: 'definition',
    title: 'Bloc Définition',
    description: 'Encadré repliable pour formaliser une définition',
    keywords: ['definition', 'définition', 'def', 'academique'],
    badge: '/def',
    icon: 'definition',
    run: ({ editor, range }) => {
      const typedEditor = editor as Editor;
      if (range) {
        typedEditor.chain().focus().deleteRange(range).run();
      }
      insertAcademicBlockNode(typedEditor, 'definition');
    },
  },
  {
    id: 'theorem',
    title: 'Bloc Théorème',
    description: 'Encadré repliable pour théorème, lemme ou proposition',
    keywords: ['theoreme', 'théorème', 'lemme', 'corollaire', 'proposition'],
    badge: '/theo',
    icon: 'theorem',
    run: ({ editor, range }) => {
      const typedEditor = editor as Editor;
      if (range) {
        typedEditor.chain().focus().deleteRange(range).run();
      }
      insertAcademicBlockNode(typedEditor, 'theorem');
    },
  },
  {
    id: 'proof',
    title: 'Bloc Démonstration',
    description: 'Encadré repliable avec symbole CQFD □',
    keywords: ['demonstration', 'démonstration', 'preuve', 'proof', 'cqfd'],
    badge: '/preuve',
    icon: 'proof',
    run: ({ editor, range }) => {
      const typedEditor = editor as Editor;
      if (range) {
        typedEditor.chain().focus().deleteRange(range).run();
      }
      insertAcademicBlockNode(typedEditor, 'proof');
    },
  },
  {
    id: 'example',
    title: 'Bloc Exemple',
    description: 'Encadré repliable pour illustration d’un théorème',
    keywords: ['exemple', 'example', 'application'],
    badge: '/exemple',
    icon: 'example',
    run: ({ editor, range }) => {
      const typedEditor = editor as Editor;
      if (range) {
        typedEditor.chain().focus().deleteRange(range).run();
      }
      insertAcademicBlockNode(typedEditor, 'example');
    },
  },
  {
    id: 'exercise',
    title: 'Bloc Exercice',
    description: 'Encadré repliable pour exercice et solution',
    keywords: ['exercice', 'exercise', 'exo', 'td', 'probleme'],
    badge: '/exo',
    icon: 'exercise',
    run: ({ editor, range }) => {
      const typedEditor = editor as Editor;
      if (range) {
        typedEditor.chain().focus().deleteRange(range).run();
      }
      insertAcademicBlockNode(typedEditor, 'exercise');
    },
  },
  {
    id: 'matrix',
    title: 'Matrice (2×2)',
    description: 'Bloc LaTeX prérempli pour matrice (modifiable via grille)',
    keywords: ['matrice', 'matrix', 'determinant', 'algèbre'],
    badge: '/matrice',
    icon: 'matrix',
    run: ({ editor, range }) => {
      const { latex } = generateMathStructureLatex('pmatrix', 2, 2, true);
      insertBlockNodeAtSelection(
        editor as Editor,
        { type: 'blockMath', attrs: { latex } },
        range
      );
    },
  },
  {
    id: 'vector',
    title: 'Vecteur colonne',
    description: 'Bloc LaTeX pour vecteur à 3 composantes',
    keywords: ['vecteur', 'vector', 'colonne'],
    badge: '/vecteur',
    icon: 'matrix',
    run: ({ editor, range }) => {
      const { latex } = generateMathStructureLatex('vector', 3, 1, true);
      insertBlockNodeAtSelection(
        editor as Editor,
        { type: 'blockMath', attrs: { latex } },
        range
      );
    },
  },
  {
    id: 'system',
    title: 'Système d’équations',
    description: 'Accolade {cases} multi-équations en LaTeX',
    keywords: ['systeme', 'système', 'equations', 'cases'],
    badge: '/systeme',
    icon: 'matrix',
    run: ({ editor, range }) => {
      const { latex } = generateMathStructureLatex('cases', 2, 1, true);
      insertBlockNodeAtSelection(
        editor as Editor,
        { type: 'blockMath', attrs: { latex } },
        range
      );
    },
  },
];

export function filterSlashCommandItems(query: string): SlashCommandItem[] {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) {
    return SLASH_COMMAND_ITEMS;
  }

  return SLASH_COMMAND_ITEMS.filter((item) => {
    const haystack = [
      normalizeSearchText(item.title),
      normalizeSearchText(item.description),
      ...item.keywords.map(normalizeSearchText),
    ];
    return haystack.some((entry) => entry.includes(normalizedQuery));
  });
}

function updatePopupPosition(
  popupEl: HTMLElement,
  clientRect: (() => DOMRect | null) | null | undefined
): void {
  const rect = clientRect?.();
  if (!rect) {
    return;
  }

  const virtualReference = {
    getBoundingClientRect: () => rect,
  };

  void computePosition(virtualReference, popupEl, {
    strategy: 'fixed',
    placement: 'bottom-start',
    middleware: [offset(8), flip(), shift({ padding: 12 })],
  }).then(({ x, y }) => {
    popupEl.style.left = `${x}px`;
    popupEl.style.top = `${y}px`;
  });
}

export const SlashCommand = Extension.create<{
  suggestion: Partial<SuggestionOptions<SlashCommandItem>>;
}>({
  name: 'slashCommand',

  addOptions() {
    return {
      suggestion: {
        char: '/',
        allowSpaces: false,
        allow: ({ state, range }) => {
          const $from = state.doc.resolve(range.from);
          return !$from.parent.type.spec.code;
        },
        items: ({ query }) => filterSlashCommandItems(query),
        command: ({ editor, range, props }) => {
          props.run({ editor, range });
        },
        render: () => {
          let component: ReactRenderer<SlashCommandListHandle> | null = null;
          let popup: HTMLDivElement | null = null;

          return {
            onStart: (props) => {
              popup = document.createElement('div');
              popup.style.position = 'fixed';
              popup.style.zIndex = '60';
              document.body.appendChild(popup);

              component = new ReactRenderer(SlashCommandList, {
                props: {
                  items: props.items,
                  command: (item: SlashCommandItem) => props.command(item),
                },
                editor: props.editor,
              });

              popup.appendChild(component.element);
              updatePopupPosition(popup, props.clientRect);
            },

            onUpdate: (props) => {
              component?.updateProps({
                items: props.items,
                command: (item: SlashCommandItem) => props.command(item),
              });
              if (popup) {
                updatePopupPosition(popup, props.clientRect);
              }
            },

            onKeyDown: (props) => {
              if (props.event.key === 'Escape') {
                popup?.remove();
                popup = null;
                component?.destroy();
                component = null;
                return true;
              }
              return component?.ref?.onKeyDown({ event: props.event }) ?? false;
            },

            onExit: () => {
              popup?.remove();
              popup = null;
              component?.destroy();
              component = null;
            },
          };
        },
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
      }),
    ];
  },
});

