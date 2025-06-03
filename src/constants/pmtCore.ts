export const DATATYPE_COLOR = {
  BOOLEAN: '#F77', // red
  INT: '#7F7', // green
  FLOAT: '#7F7', // green
  STRING: '#77F', // purple

  '1D': '#facc15', // yellow (Array, 1D np.NdArray)
  TABLE: '#a3e635', // lime (DataFrame, pandas.DataFrame)
  DICT: '#fb923c', // orange
  JSON_FILE: '#b45309', // amber

  '2D': '#22d3ee', // cyan (Matrix, 2D np.NdArray)
  DICOM_OBJ: '#2dd4bf', // teal
  DICOM_FILE: '#0f766e', // teal

  DICOM_VOLUME_FILE: '#7d6e91', // teal+pink
  DICOM_FILE_LIST: '#f472b6', // pink
  SERIES_FILE_LIST: '#ec4899', // pink
  STUDY_FILE_LIST: '#8b5cf6', // violet

  '3D': '#e879f9', // fuchsia (Volume, 3D np.NdArray)
  NIFTI_OBJ: '#db2777', // pink
  NIFTI_FILE: '#be185d', // pink
  // LABELMAP: '#86efac', // green

  IMAGE_FILE: '#2563eb', // blue

  FILE: '#4338ca', // indigo (other general file types)

  LOOP: '#be123c' // rose
}

export const NODE_STATUS_COLOR = {
  white: '#fff',
  pending: '#ff0', // yellow
  waiting: '#ffa500', // orange
  current: '#3b82f6', // blue
  done: '#0f0', // green
  error: '#f00' // red
}

export enum ParsedLevel {
  PATIENT = 0,
  STUDY = 1,
  SERIES = 2,
  INSTANCE = 3
}
