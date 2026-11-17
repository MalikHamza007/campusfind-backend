/** Realistic seed data for CampusFind (fictional people and events). */
export const DEPARTMENTS = ['Computer Science', 'Business Administration', 'Engineering', 'English'] as const;

export const ADMIN = { fullName: 'Nadia Rehman', studentId: 'GSU-2015-ADM-001', department: 'Lost & Found Office', phone: '+92 42 3591 0100' };

export const STUDENTS = [
  { fullName: 'Ali Raza', email: 'ali.raza@campusfind.edu.pk', studentId: 'GSU-2023-CS-041', department: 'Computer Science', phone: '+92 300 4512 781' },
  { fullName: 'Ayesha Khan', email: 'ayesha.khan@campusfind.edu.pk', studentId: 'GSU-2024-BBA-018', department: 'Business Administration', phone: '+92 321 7745 102' },
  { fullName: 'Hamza Saeed', email: 'hamza.saeed@campusfind.edu.pk', studentId: 'GSU-2022-EE-112', department: 'Engineering', phone: '+92 333 1209 554' },
  { fullName: 'Fatima Noor', email: 'fatima.noor@campusfind.edu.pk', studentId: 'GSU-2023-EN-027', department: 'English', phone: '+92 345 8890 213' },
  { fullName: 'Usman Tariq', email: 'usman.tariq@campusfind.edu.pk', studentId: 'GSU-2024-CS-063', department: 'Computer Science' },
  { fullName: 'Zainab Ahmed', email: 'zainab.ahmed@campusfind.edu.pk', studentId: 'GSU-2023-BBA-044', department: 'Business Administration', phone: '+92 301 6623 990' },
  { fullName: 'Omar Farooq', email: 'omar.farooq@campusfind.edu.pk', studentId: 'GSU-2022-ME-019', department: 'Engineering' },
  { fullName: 'Hira Malik', email: 'hira.malik@campusfind.edu.pk', studentId: 'GSU-2024-EN-008', department: 'English', phone: '+92 322 4410 876' },
  { fullName: 'Saad Qureshi', email: 'saad.qureshi@campusfind.edu.pk', studentId: 'GSU-2022-CS-090', department: 'Computer Science' },
  { fullName: 'Mariam Iqbal', email: 'mariam.iqbal@campusfind.edu.pk', studentId: 'GSU-2023-CE-051', department: 'Engineering', phone: '+92 336 5021 447' },
  { fullName: 'Danish Javed', email: 'danish.javed@campusfind.edu.pk', studentId: 'GSU-2024-BBA-072', department: 'Business Administration' },
  { fullName: 'Sana Butt', email: 'sana.butt@campusfind.edu.pk', studentId: 'GSU-2023-CS-015', department: 'Computer Science', phone: '+92 311 9087 365' },
];

export const LOCATIONS: Record<string, { lat: number; lng: number }> = {
  'Main Library': { lat: 31.5212, lng: 74.3521 },
  'IT Lab 03': { lat: 31.5198, lng: 74.3488 },
  Cafeteria: { lat: 31.5181, lng: 74.3542 },
  Auditorium: { lat: 31.5226, lng: 74.3497 },
  'Admin Block': { lat: 31.5205, lng: 74.356 },
  'Sports Complex': { lat: 31.5163, lng: 74.3475 },
  'Parking Area': { lat: 31.524, lng: 74.3569 },
  'Engineering Block': { lat: 31.5189, lng: 74.351 },
};

export interface SeedItem {
  key: string;
  type: 'lost' | 'found';
  title: string;
  category: string;
  description: string;
  date: string;
  location: string;
  status: 'open' | 'claim_pending' | 'matched' | 'returned' | 'closed';
  reporter: number; // index into STUDENTS
  color?: string;
  brand?: string;
  features?: string;
  images: number; // number of photos (seed generates them)
}

// 20 found reports
export const FOUND: SeedItem[] = [
  { key: 'F1', type: 'found', title: 'Casio FX-991ES Calculator', category: 'calculator', description: 'Grey scientific calculator left on a desk in the second row after the Calculus II midterm. Slide cover attached.', date: '2026-11-12', location: 'IT Lab 03', status: 'claim_pending', reporter: 4, color: 'Grey', brand: 'Casio', features: 'Initials scratched on the back cover, small crack near the solar panel', images: 2 },
  { key: 'F2', type: 'found', title: 'Blue Kingston USB Drive', category: 'electronics', description: 'Blue 32 GB Kingston flash drive found plugged into PC 14. It has a red lanyard loop attached.', date: '2026-11-10', location: 'IT Lab 03', status: 'claim_pending', reporter: 8, color: 'Blue', brand: 'Kingston', features: 'Red lanyard loop', images: 1 },
  { key: 'F3', type: 'found', title: 'Black Leather Wallet', category: 'wallet', description: 'Black bi-fold leather wallet found under a table near the juice counter. Contains cards; handed to the office.', date: '2026-11-08', location: 'Cafeteria', status: 'claim_pending', reporter: 2, color: 'Black', features: 'Stitched initial "Z" inside', images: 2 },
  { key: 'F4', type: 'found', title: 'Data Structures Textbook', category: 'book', description: 'Data Structures and Algorithms in C++ (4th edition) with yellow highlighting and sticky notes on chapters 5 to 8.', date: '2026-11-05', location: 'Main Library', status: 'claim_pending', reporter: 3, color: 'White and blue', brand: 'Wiley', features: 'Sticky notes and pencil annotations', images: 1 },
  { key: 'F5', type: 'found', title: 'Set of Keys with Car Fob', category: 'keys', description: 'Three keys on a silver ring with a Suzuki car remote and a small football keychain, found near gate 2.', date: '2026-11-03', location: 'Parking Area', status: 'claim_pending', reporter: 6, color: 'Silver', brand: 'Suzuki', features: 'Football keychain', images: 1 },
  { key: 'F6', type: 'found', title: 'University ID Card', category: 'id_card', description: 'Student ID card found on the auditorium steps after the orientation seminar. Card number 3520212345671 on the back.', date: '2026-10-28', location: 'Auditorium', status: 'matched', reporter: 9, color: 'Green', features: 'Clear plastic holder with green lanyard', images: 1 },
  { key: 'F7', type: 'found', title: 'Navy Blue Hoodie', category: 'clothing', description: 'Navy hoodie with the university crest, size M, left on the bleachers after the inter-department cricket match.', date: '2026-10-25', location: 'Sports Complex', status: 'matched', reporter: 0, color: 'Navy blue', features: 'Name tag cut off, crest on chest', images: 2 },
  { key: 'F8', type: 'found', title: 'Wireless Earbuds Case', category: 'electronics', description: 'White wireless earbuds charging case with both earbuds inside, found on a reading table on the first floor.', date: '2026-10-22', location: 'Main Library', status: 'matched', reporter: 7, color: 'White', brand: 'Samsung', features: 'Purple silicone cover', images: 1 },
  { key: 'F9', type: 'found', title: 'Texas Instruments Calculator', category: 'calculator', description: 'Black graphing calculator found in the engineering drawing hall. Batteries still working.', date: '2026-10-19', location: 'Engineering Block', status: 'open', reporter: 11, color: 'Black', brand: 'Texas Instruments', features: 'Sticker of a rocket on the back', images: 1 },
  { key: 'F10', type: 'found', title: 'Brown Card Holder', category: 'wallet', description: 'Slim brown card holder with a metro bus card and a library card inside, left on a chair in the admin lobby.', date: '2026-10-16', location: 'Admin Block', status: 'open', reporter: 5, color: 'Brown', features: 'Embossed tree logo', images: 1 },
  { key: 'F11', type: 'found', title: 'HP Laptop Charger', category: 'electronics', description: 'HP 65W laptop charger with a round barrel pin, found plugged in at the back of lab 03.', date: '2026-10-02', location: 'IT Lab 03', status: 'returned', reporter: 1, color: 'Black', brand: 'HP', features: 'Masking tape label on the brick', images: 1 },
  { key: 'F12', type: 'found', title: 'Spectacles in Red Case', category: 'other', description: 'Prescription glasses with thin black frames inside a red hard case, found on the cafeteria counter.', date: '2026-09-21', location: 'Cafeteria', status: 'returned', reporter: 3, color: 'Red case', features: 'Case has a small dent', images: 1 },
  { key: 'F13', type: 'found', title: 'Green Water Bottle', category: 'other', description: 'Green steel water bottle with stickers, found next to the badminton court benches after evening practice.', date: '2026-10-30', location: 'Sports Complex', status: 'open', reporter: 10, color: 'Green', brand: 'Milton', features: 'Planet stickers', images: 1 },
  { key: 'F14', type: 'found', title: 'English Literature Anthology', category: 'book', description: 'Norton Anthology of English Literature volume 2, name on first page partly torn, found in reading room B.', date: '2026-11-14', location: 'Main Library', status: 'open', reporter: 5, color: 'Blue', brand: 'Norton', features: 'Torn first page', images: 1 },
  { key: 'F15', type: 'found', title: 'Single House Key on Ring', category: 'keys', description: 'Single brass house key on a plain ring with a small blue tag, found near the main gate parking bay.', date: '2026-11-15', location: 'Parking Area', status: 'open', reporter: 0, color: 'Brass', features: 'Blue plastic tag', images: 1 },
  { key: 'F16', type: 'found', title: 'Grey Wool Scarf', category: 'clothing', description: 'Grey knitted wool scarf found hanging on a seat in the auditorium after the debating finals.', date: '2026-11-11', location: 'Auditorium', status: 'open', reporter: 1, color: 'Grey', features: 'Tassels on both ends', images: 1 },
  { key: 'F17', type: 'found', title: 'Power Bank 10000mAh', category: 'electronics', description: 'Black Xiaomi power bank with a short USB-C cable wrapped around it, found on the cafeteria terrace.', date: '2026-11-16', location: 'Cafeteria', status: 'open', reporter: 9, color: 'Black', brand: 'Xiaomi', features: 'Scratch across the logo', images: 1 },
  { key: 'F18', type: 'found', title: 'Engineering Drawing Kit', category: 'other', description: 'Zipped drawing kit with compass, set squares and a clutch pencil, found in the engineering block corridor.', date: '2026-11-13', location: 'Engineering Block', status: 'open', reporter: 6, color: 'Black pouch', brand: 'Staedtler', features: 'Initials "MI" on the zip', images: 0 },
  { key: 'F19', type: 'found', title: 'Umbrella with Wooden Handle', category: 'other', description: 'Black folding umbrella with a curved wooden handle left at the admin block reception during the rain.', date: '2026-09-09', location: 'Admin Block', status: 'closed', reporter: 7, color: 'Black', features: 'Wooden handle', images: 0 },
  { key: 'F20', type: 'found', title: 'Library Card in Sleeve', category: 'id_card', description: 'University library card in a transparent sleeve, found in the photocopy area. Card ID 4410098812.', date: '2026-11-17', location: 'Main Library', status: 'open', reporter: 2, color: 'Blue', features: 'Transparent sleeve', images: 0 },
];

// 20 lost reports
export const LOST: SeedItem[] = [
  { key: 'L1', type: 'lost', title: 'Lost University ID Card', category: 'id_card', description: 'I lost my student ID card around the auditorium after the orientation seminar. It was in a clear holder.', date: '2026-10-28', location: 'Auditorium', status: 'matched', reporter: 0, color: 'Green', features: 'Clear holder, green lanyard', images: 0 },
  { key: 'L2', type: 'lost', title: 'Navy University Hoodie', category: 'clothing', description: 'My navy blue university hoodie (size M) went missing after the cricket match at the sports complex.', date: '2026-10-25', location: 'Sports Complex', status: 'matched', reporter: 4, color: 'Navy blue', images: 1 },
  { key: 'L3', type: 'lost', title: 'Samsung Earbuds in Purple Cover', category: 'electronics', description: 'Lost my Samsung Galaxy Buds in a white case with a purple silicone cover in the library first floor.', date: '2026-10-22', location: 'Main Library', status: 'matched', reporter: 3, color: 'White', brand: 'Samsung', features: 'Purple cover', images: 1 },
  { key: 'L4', type: 'lost', title: 'HP Laptop Charger', category: 'electronics', description: 'Left my HP 65W charger plugged into the wall socket at the back of IT Lab 03 during the evening lab.', date: '2026-10-01', location: 'IT Lab 03', status: 'returned', reporter: 8, color: 'Black', brand: 'HP', features: 'Masking tape with my initials', images: 0 },
  { key: 'L5', type: 'lost', title: 'Prescription Glasses', category: 'other', description: 'Lost my reading glasses in a red hard case somewhere in the cafeteria during lunch break.', date: '2026-09-20', location: 'Cafeteria', status: 'returned', reporter: 7, color: 'Red case', images: 1 },
  { key: 'L6', type: 'lost', title: 'Casio Scientific Calculator', category: 'calculator', description: 'Lost my Casio FX-991ES calculator after the Calculus II midterm in IT Lab 03. I need it for my finals.', date: '2026-11-12', location: 'IT Lab 03', status: 'open', reporter: 0, color: 'Grey', brand: 'Casio', features: 'Initials AR scratched on the back', images: 1 },
  { key: 'L7', type: 'lost', title: 'Black Bi-fold Wallet', category: 'wallet', description: 'My black leather wallet fell somewhere in the cafeteria. It has my bank card and a family photo.', date: '2026-11-08', location: 'Cafeteria', status: 'open', reporter: 5, color: 'Black', features: 'Letter Z stitched inside', images: 1 },
  { key: 'L8', type: 'lost', title: 'Kingston USB Drive with Thesis', category: 'electronics', description: 'Lost a blue Kingston USB drive containing my final year thesis drafts in the IT lab.', date: '2026-11-10', location: 'IT Lab 03', status: 'open', reporter: 1, color: 'Blue', brand: 'Kingston', features: 'Red lanyard loop', images: 1 },
  { key: 'L9', type: 'lost', title: 'Car Keys with Football Keychain', category: 'keys', description: 'Lost my car keys with a Suzuki remote and a small football keychain near the parking area.', date: '2026-11-03', location: 'Parking Area', status: 'open', reporter: 10, color: 'Silver', brand: 'Suzuki', images: 1 },
  { key: 'L10', type: 'lost', title: 'Microeconomics Notes Folder', category: 'book', description: 'Blue ring folder with handwritten microeconomics notes for the whole semester, lost in the admin block.', date: '2026-11-06', location: 'Admin Block', status: 'open', reporter: 1, color: 'Blue', images: 0 },
  { key: 'L11', type: 'lost', title: 'Silver Wrist Watch', category: 'other', description: 'Silver analog wrist watch with a metal strap, a gift from my father, lost near the badminton courts.', date: '2026-10-30', location: 'Sports Complex', status: 'open', reporter: 2, color: 'Silver', brand: 'Casio', images: 0 },
  { key: 'L12', type: 'lost', title: 'Maroon Cardigan', category: 'clothing', description: 'Maroon knitted cardigan left in the auditorium after the debating finals rehearsal.', date: '2026-11-11', location: 'Auditorium', status: 'open', reporter: 7, color: 'Maroon', images: 0 },
  { key: 'L13', type: 'lost', title: 'Data Structures Book', category: 'book', description: 'Lost my Data Structures textbook with yellow highlighting and sticky notes in the main library.', date: '2026-11-05', location: 'Main Library', status: 'open', reporter: 8, color: 'White and blue', brand: 'Wiley', images: 0 },
  { key: 'L14', type: 'lost', title: 'Bluetooth Headphones', category: 'electronics', description: 'Black over-ear Bluetooth headphones lost in the engineering block lecture theatre 2.', date: '2026-11-09', location: 'Engineering Block', status: 'open', reporter: 9, color: 'Black', brand: 'JBL', images: 1 },
  { key: 'L15', type: 'lost', title: 'Hostel Room Key', category: 'keys', description: 'Single key for hostel room 214 on a ring with a blue tag, lost on the way from the parking area.', date: '2026-11-15', location: 'Parking Area', status: 'open', reporter: 11, color: 'Brass', images: 0 },
  { key: 'L16', type: 'lost', title: 'Graphing Calculator', category: 'calculator', description: 'Lost a black graphing calculator during the engineering drawing class. It has a rocket sticker.', date: '2026-10-19', location: 'Engineering Block', status: 'open', reporter: 6, color: 'Black', brand: 'Texas Instruments', images: 0 },
  { key: 'L17', type: 'lost', title: 'Pink Pencil Pouch', category: 'other', description: 'Pink pencil pouch with highlighters and a USB-C cable lost in reading room B of the library.', date: '2026-11-16', location: 'Main Library', status: 'open', reporter: 3, color: 'Pink', images: 0 },
  { key: 'L18', type: 'lost', title: 'Black Umbrella', category: 'other', description: 'Black umbrella with wooden handle left at the admin reception on a rainy morning.', date: '2026-09-08', location: 'Admin Block', status: 'closed', reporter: 9, color: 'Black', images: 0 },
  { key: 'L19', type: 'lost', title: 'Lab Coat with Name Badge', category: 'clothing', description: 'White lab coat with my name badge lost after the chemistry practical in the engineering block.', date: '2026-09-15', location: 'Engineering Block', status: 'closed', reporter: 6, color: 'White', images: 0 },
  { key: 'L20', type: 'lost', title: 'Brown Card Holder', category: 'wallet', description: 'Lost a brown card holder with my bus card and library card somewhere in the admin block lobby.', date: '2026-10-16', location: 'Admin Block', status: 'open', reporter: 11, color: 'Brown', features: 'Embossed tree logo', images: 0 },
];

export interface SeedClaim {
  found: string;
  lost?: string;
  claimant: number;
  status: 'pending' | 'approved' | 'rejected' | 'withdrawn' | 'returned';
  evidence: string;
  adminNote?: string;
  evidenceFiles: number;
  daysAfter: number;
}

export const CLAIMS: SeedClaim[] = [
  // pending (5)
  { found: 'F1', lost: 'L6', claimant: 0, status: 'pending', evidence: 'The calculator has my initials AR scratched on the back cover and a small crack near the solar panel. I can show the purchase receipt.', evidenceFiles: 1, daysAfter: 1 },
  { found: 'F2', lost: 'L8', claimant: 1, status: 'pending', evidence: 'The drive contains a folder named "Thesis_Final" with my chapter drafts. The red lanyard was tied by me for the lab key ring.', evidenceFiles: 0, daysAfter: 1 },
  { found: 'F3', lost: 'L7', claimant: 5, status: 'pending', evidence: 'The wallet has a letter Z stitched inside, my bank card in my name and a family photo behind the clear window.', evidenceFiles: 1, daysAfter: 2 },
  { found: 'F4', lost: 'L13', claimant: 8, status: 'pending', evidence: 'My textbook has sticky notes on chapters 5 to 8 with my handwriting about AVL trees and a pencil drawing on the last page.', evidenceFiles: 0, daysAfter: 2 },
  { found: 'F5', lost: 'L9', claimant: 10, status: 'pending', evidence: 'The Suzuki remote pairs with my car parked in bay 12. The football keychain is from my school team, number 9 on the back.', evidenceFiles: 1, daysAfter: 1 },
  // approved (3)
  { found: 'F6', lost: 'L1', claimant: 0, status: 'approved', evidence: 'The ID card shows my photo and student number. I lost it at the orientation seminar in the auditorium on 28 October.', adminNote: 'Photo on card matches the claimant. Collect from the office with CNIC.', evidenceFiles: 0, daysAfter: 2 },
  { found: 'F7', lost: 'L2', claimant: 4, status: 'approved', evidence: 'My hoodie is size M with the university crest. I cut off the name tag because it was itchy, the stitching is still visible.', adminNote: 'Description and size match.', evidenceFiles: 1, daysAfter: 3 },
  { found: 'F8', lost: 'L3', claimant: 3, status: 'approved', evidence: 'The earbuds are paired with my phone, I can show the Galaxy Wearable app with the serial number and the purple cover I bought.', adminNote: 'Serial number verified against the app screenshot.', evidenceFiles: 1, daysAfter: 2 },
  // rejected (3)
  { found: 'F9', claimant: 2, status: 'rejected', evidence: 'I think this might be my calculator because I also study engineering and lost one around this time last month.', adminNote: 'No distinguishing detail provided; the rocket sticker was not mentioned.', evidenceFiles: 0, daysAfter: 4 },
  { found: 'F10', claimant: 4, status: 'rejected', evidence: 'I had a brown card holder that I used for my bus card, I may have dropped it in the admin block lobby.', adminNote: 'Card names inside do not match the claimant.', evidenceFiles: 0, daysAfter: 3 },
  { found: 'F1', claimant: 9, status: 'rejected', evidence: 'This looks like the calculator I lost in the lab last week, it is the same Casio model I use for my courses.', adminNote: 'Initials on the back do not match.', evidenceFiles: 0, daysAfter: 2 },
  // returned (2)
  { found: 'F11', lost: 'L4', claimant: 8, status: 'returned', evidence: 'The charger brick has masking tape with my initials SQ and the cable has a twist tie I added. I lost it on 1 October.', adminNote: 'Handed over at the office.', evidenceFiles: 1, daysAfter: 2 },
  { found: 'F12', lost: 'L5', claimant: 7, status: 'returned', evidence: 'My glasses are prescription -1.75 in both eyes with thin black frames, and the red case has a small dent on the hinge.', adminNote: 'Prescription verified with optician card.', evidenceFiles: 0, daysAfter: 1 },
  // withdrawn (1)
  { found: 'F13', claimant: 2, status: 'withdrawn', evidence: 'I lost a green bottle near the courts, but mine has a different brand so I am not fully sure this is it.', evidenceFiles: 0, daysAfter: 1 },
];
