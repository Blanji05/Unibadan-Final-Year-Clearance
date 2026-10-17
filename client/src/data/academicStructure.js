/**
 * Master Academic Structure for University of Ibadan
 * 21 Faculties and their respective Departments
 */

export const ACADEMIC_STRUCTURE = [
  {
    faculty: 'Agriculture',
    departments: [
      'Agronomy',
      'Agricultural Economics',
      'Animal Science',
      'Agricultural Extension and Rural Development',
      'Crop Protection and Environmental Biology',
      'Fisheries and Wildlife Management',
      'Forestry Resources Management',
    ],
  },
  {
    faculty: 'Arts',
    departments: [
      'Arabic and Islamic Studies',
      'Classics',
      'Communication and Language Arts',
      'English',
      'European Studies',
      'History',
      'Linguistics and African Languages',
      'Music',
      'Philosophy',
      'Religious Studies',
      'Theatre Arts',
    ],
  },
  {
    faculty: 'Basic Clinical Sciences',
    departments: [
      'Pharmacology and Therapeutics',
      'Pathology',
      'Medical Microbiology and Parasitology',
      'Haematology',
      'Chemical Pathology',
    ],
  },
  {
    faculty: 'Basic Medical Sciences',
    departments: [
      'Anatomy',
      'Biochemistry',
      'Physiology',
      'Medical Laboratory Science',
    ],
  },
  {
    faculty: 'Clinical Sciences',
    departments: [
      'Medicine and Surgery',
      'Anaesthesia',
      'Paediatrics',
      'Psychiatry',
      'Ophthalmology',
      'Radiology',
      'Community Medicine',
    ],
  },
  {
    faculty: 'Computing',
    departments: [
      'Computer Science and Artificial Intelligence',
      'Software Engineering',
      'Data Science',
      'Information and Communication Technology',
    ],
  },
  {
    faculty: 'Dentistry',
    departments: [
      'Child Oral Health',
      'Oral and Maxillofacial Surgery',
      'Oral Pathology/Oral Medicine',
      'Periodontology and Community Dentistry',
      'Restorative Dentistry',
    ],
  },
  {
    faculty: 'Economics and Management Sciences',
    departments: [
      'Economics',
      'Accounting',
      'Banking and Finance',
      'Marketing',
      'Business Administration',
    ],
  },
  {
    faculty: 'Education',
    departments: [
      'Adult Education',
      'Arts and Social Sciences Education',
      'Early Childhood and Educational Foundations',
      'Educational Management',
      'Guidance and Counselling',
      'Human Kinetics and Health Education',
      'Library, Archival and Information Studies',
      'Science and Technology Education',
      'Social Work',
      'Special Education',
      'Teacher Education',
    ],
  },
  {
    faculty: 'Environmental Design and Management',
    departments: [
      'Architecture',
      'Estate Management',
      'Quantity Surveying',
      'Urban and Regional Planning',
    ],
  },
  {
    faculty: 'Law',
    departments: [
      'Commercial and Industrial Law',
      'Jurisprudence',
      'Private and Property Law',
      'Public and International Law',
    ],
  },
  {
    faculty: 'Multidisciplinary Studies',
    departments: [
      'Data and Information Science',
      'Mineral, Petroleum, Energy, Economics and Law',
      'Peace, Security and Humanitarian Studies',
      'Sustainability Studies',
    ],
  },
  {
    faculty: 'Nursing',
    departments: [
      'Community Health Nursing',
      'Maternal and Child Health Nursing',
      'Medical-Surgical Nursing',
      'Mental Health Nursing',
    ],
  },
  {
    faculty: 'Pharmacy',
    departments: [
      'Clinical Pharmacy and Pharmacy Administration',
      'Pharmaceutical Chemistry',
      'Pharmaceutical Microbiology',
      'Pharmaceutics and Industrial Pharmacy',
      'Pharmacognosy',
      'Pharmacology and Toxicology',
    ],
  },
  {
    faculty: 'Physiotherapy',
    departments: [
      'Cardiorespiratory Physiotherapy',
      'Musculoskeletal/Orthopaedic Physiotherapy',
      'Neurological Physiotherapy',
      'Sports and Recreational Physiotherapy',
      'Occupational Therapy',
    ],
  },
  {
    faculty: 'Public Health',
    departments: [
      'Environmental Health Sciences',
      'Epidemiology and Medical Statistics',
      'Health Policy and Management',
      'Health Promotion and Education',
      'Human Nutrition and Dietetics',
    ],
  },
  {
    faculty: 'Renewable Natural Resources',
    departments: [
      'Aquaculture and Fisheries Management',
      'Forest Production and Products',
      'Forest Resources Management',
      'Social and Environmental Forestry',
      'Wildlife and Ecotourism Management',
    ],
  },
  {
    faculty: 'Science',
    departments: [
      'Archaeology and Anthropology',
      'Botany',
      'Chemistry',
      'Geography',
      'Geology',
      'Mathematics',
      'Microbiology',
      'Physics',
      'Statistics',
      'Zoology',
    ],
  },
  {
    faculty: 'Social Sciences',
    departments: [
      'Political Science',
      'Psychology',
      'Sociology',
      'Geography (human geography)',
    ],
  },
  {
    faculty: 'Technology',
    departments: [
      'Agricultural and Environmental Engineering',
      'Civil Engineering',
      'Electrical and Electronics Engineering',
      'Food Technology',
      'Industrial and Production Engineering',
      'Mechanical Engineering',
      'Petroleum Engineering',
      'Wood Products Engineering',
      'Aeronautics and Aerospace Engineering',
    ],
  },
  {
    faculty: 'Veterinary Medicine',
    departments: [
      'Veterinary Anatomy',
      'Veterinary Physiology and Biochemistry',
      'Veterinary Microbiology',
      'Veterinary Parasitology',
      'Veterinary Pathology',
      'Veterinary Pharmacology and Toxicology',
      'Theriogenology',
      'Veterinary Medicine',
      'Veterinary Surgery and Radiology',
      'Veterinary Public Health and Preventive Medicine',
    ],
  },
];

export function getFaculties() {
  return ACADEMIC_STRUCTURE.map((item) => item.faculty);
}

export function getDepartmentsForFaculty(facultyName) {
  if (!facultyName) return [];
  const clean = facultyName.replace(/^Faculty of\s+/i, '').trim().toLowerCase();
  const found = ACADEMIC_STRUCTURE.find((f) => f.faculty.toLowerCase() === clean);
  return found ? found.departments : [];
}

export function getAllDepartments() {
  const list = [];
  ACADEMIC_STRUCTURE.forEach((f) => {
    f.departments.forEach((d) => list.push({ department: d, faculty: f.faculty }));
  });
  return list;
}

/**
 * Official Residential Halls of the University of Ibadan
 * Male Halls, Female Halls, Clinical & Postgraduate Halls
 */
export const UI_HALLS = [
  'Mellanby Hall',
  'Tedder Hall',
  'Kuti Hall',
  'Sultan Bello Hall',
  'Nnamdi Azikiwe Hall',
  'Independence Hall',
  'Queen Elizabeth II Hall',
  'Queen Idia Hall',
  'Obafemi Awolowo Hall',
];

export function getHalls() {
  return UI_HALLS;
}


