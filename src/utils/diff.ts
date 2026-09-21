export interface DiffBlock {
  type: 'equal' | 'delete' | 'insert' | 'replace';
  textA: string;
  textB: string;
}

export function computeLineDiff(textA: string, textB: string): DiffBlock[] {
  const linesA = textA.split('\n');
  const linesB = textB.split('\n');
  const blocks: DiffBlock[] = [];

  let i = 0;
  let j = 0;

  while (i < linesA.length || j < linesB.length) {
    if (i < linesA.length && j < linesB.length && linesA[i] === linesB[j]) {
      blocks.push({
        type: 'equal',
        textA: linesA[i],
        textB: linesB[j],
      });
      i++;
      j++;
    } else if (i < linesA.length && j < linesB.length) {
      // Look ahead to see if one line was inserted or deleted
      const nextMatchInB = linesB.indexOf(linesA[i], j);
      const nextMatchInA = linesA.indexOf(linesB[j], i);

      if (nextMatchInB !== -1 && (nextMatchInA === -1 || nextMatchInB - j < nextMatchInA - i)) {
        // Insertion in B
        while (j < nextMatchInB) {
          blocks.push({
            type: 'insert',
            textA: '',
            textB: linesB[j],
          });
          j++;
        }
      } else if (nextMatchInA !== -1) {
        // Deletion in A
        while (i < nextMatchInA) {
          blocks.push({
            type: 'delete',
            textA: linesA[i],
            textB: '',
          });
          i++;
        }
      } else {
        // Modified/Replaced line
        blocks.push({
          type: 'replace',
          textA: linesA[i],
          textB: linesB[j],
        });
        i++;
        j++;
      }
    } else if (i < linesA.length) {
      blocks.push({
        type: 'delete',
        textA: linesA[i],
        textB: '',
      });
      i++;
    } else {
      blocks.push({
        type: 'insert',
        textA: '',
        textB: linesB[j],
      });
      j++;
    }
  }

  return blocks;
}
