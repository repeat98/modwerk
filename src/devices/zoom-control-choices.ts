// Named controls adapted from Roman Rusinov's MIT selector_metadata.py at
// aee98c53d7b568cbb55bb927aefbdc9b4e739f3e. Each pair is a label and its
// inclusive upper bound on the pedal. Only original Modwerk-catalogue effects.
type Steps = readonly (readonly [label: string, through: number])[]
const choices: Record<string, Record<string, Steps>> = {
  497: {
    Key: [
      ['C', 0], ['C#', 1], ['D', 2], ['D#', 3], ['E', 4],
      ['F', 5], ['F#', 6], ['G', 7], ['G#', 8], ['A', 9],
      ['A#', 10], ['B', 11],
    ],
    Scale: [
      ['Free', 0], ['Chrom', 1], ['Major', 2], ['Minor', 3], ['Dor', 4],
      ['Pent', 5], ['MinPt', 6], ['Whole', 7], ['Fifth', 8], ['Oct', 9],
    ],
  },
  418: {
    Move: [
      ['Pick', 0], ['Slow', 1], ['Fast', 2], ['Chat', 3],
    ],
  },
  947: {
    Chops: [
      ['Trans', 0], ['1', 1], ['2', 2], ['3', 3], ['4', 4],
      ['5', 5], ['6', 6], ['7', 7], ['8', 8], ['9', 9],
      ['10', 10], ['11', 11], ['12', 12], ['13', 13], ['14', 14],
      ['15', 15], ['16', 16],
    ],
    Order: [
      ['Fwd', 0], ['Back', 1], ['Swap', 2], ['Skip', 3], ['Stutr', 4],
      ['Build', 5], ['Mix1', 6], ['Mix2', 7], ['Mix3', 8], ['Mix4', 9],
      ['Mix5', 10], ['Mix6', 11], ['Mix7', 12], ['Mix8', 13], ['Rpt1', 14],
      ['Rpt2', 15], ['Rpt3', 16], ['Rpt4', 17], ['Rpt5', 18], ['Rpt6', 19],
      ['Rand', 20], ['Chaos', 21],
    ],
    Pitch: [
      ['-12', 0], ['-7', 1], ['-5', 2], ['Unity', 3], ['+5', 4],
      ['+7', 5], ['+12', 6], ['Oct+', 7], ['Oct-', 8], ['Octs', 9],
      ['Fifth', 10], ['Some', 11], ['Wild', 12],
    ],
    Reverse: [
      ['Off', 0], ['Few', 1], ['Alt', 2], ['Half', 3], ['Most', 4],
      ['All', 5], ['Ping', 6], ['Scatr', 7],
    ],
    Stretch: [
      ['1/4', 0], ['1/3', 1], ['1/2', 2], ['3/4', 3], ['Off', 4],
      ['1.5x', 5], ['2x', 6],
    ],
  },
  417: {
    Split: [
      ['Low', 0], ['Mid', 1], ['High', 2],
    ],
    Mode: [
      ['Bit', 0], ['Redux', 1], ['Both', 2],
    ],
  },
  492: {
    Pitch: [
      ['-24', 0], ['-12', 1], ['-7', 2], ['-5', 3], ['-3', 4],
      ['Unity', 5], ['+3', 6], ['+5', 7], ['+7', 8], ['+12', 9],
      ['+24', 10],
    ],
    Pattern: [
      ['Off', 0], ['Oct', 1], ['Oct-', 2], ['Fifth', 3], ['Pwr', 4],
      ['Maj', 5], ['Min', 6], ['Down', 7], ['Sus', 8], ['Pent', 9],
      ['Wide', 10],
    ],
  },
  459: {
    Div: [
      ['Grain', 6], ['1/32', 18], ['1/16T', 31], ['1/16', 43], ['1/8T', 56],
      ['1/8', 68], ['1/8.', 81], ['1/4', 100],
    ],
  },
  465: {
    Route: [
      ['BDRCS', 20], ['SCRDB', 40], ['DSBCR', 60], ['RCSBD', 80], ['SBRDC', 100],
    ],
  },
  472: {
    Mode: [
      ['Room', 16], ['Digit', 33], ['Peak', 50], ['Gate', 66], ['Wave', 83],
      ['Gong', 100],
    ],
  },
  449: {
    Div: [
      ['1/32', 12], ['1/16T', 24], ['1/16', 37], ['1/8T', 49], ['1/8', 62],
      ['1/8.', 74], ['1/4', 87], ['1/4.', 100],
    ],
  },
  914: {
    Div: [
      ['1/16', 16], ['1/8T', 33], ['1/8', 49], ['1/8.', 66], ['1/4', 83],
      ['1/4.', 100],
    ],
  },
  440: {
    Capture: [
      ['Stomp', 0], ['Release', 1], ['Hold', 2],
    ],
  },
  499: {
    Mode: [
      ['Decim', 24], ['Crush', 49], ['FM', 74], ['Ring', 100],
    ],
    Order: [
      ['Fwd', 49], ['Rev', 100],
    ],
  },
}

export function zoomControlChoices(effectId: number, name: string, max: number, labels?: readonly string[] | null) {
  const upstream = choices[effectId]?.[name]
  if (upstream?.at(-1)?.[1] === max) return upstream
  if (labels?.length === max + 1) return labels.map((label, index) => [label, index] as const)
}
