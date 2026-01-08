import { db } from "../lib/firebase";
import { doc, setDoc, collection } from "firebase/firestore";

// Preloaded Users
const TEACHERS = [
    { id: 't1', name: 'Pir Ahmad', email: 'Piram@VGU', password: 'Piram@123', role: 'TEACHER' },
    { id: 't2', name: 'Qatib', email: 'Qatib@VGU', password: 'Qatib@123', role: 'TEACHER' },
    { id: 't3', name: 'Satish', email: 'Satish@VGU', password: 'Satish@123', role: 'TEACHER' }
];

const STUDENTS = [
    { id: 's1', name: 'Aditya', email: 'Aditya@VGU', password: 'Aditya@123', role: 'STUDENT' },
    { id: 's2', name: 'Sachin', email: 'Sachin@VGU', password: 'Sachin@123', role: 'STUDENT' },
    { id: 's3', name: 'Arya', email: 'Arya@VGU', password: 'Arya@123', role: 'STUDENT' },
    { id: 's4', name: 'Ayush', email: 'Ayush@VGU', password: 'Ayush@123', role: 'STUDENT' },
    { id: 's5', name: 'Pruthvi', email: 'Pruthvi@VGU', password: 'Pruthvi@123', role: 'STUDENT' },
    { id: 's6', name: 'Souvik', email: 'Souvik@VGU', password: 'Souvik@123', role: 'STUDENT' }
];

const CLASSROOMS = [
    { id: 'c1', name: 'Data Structures Lab', latitude: 26.9363, longitude: 75.9235, radiusMeters: 50 }, // Example VGU coords ?
    { id: 'c2', name: 'Operating Systems Hall', latitude: 26.9360, longitude: 75.9230, radiusMeters: 50 }
];

export const seedDatabase = async () => {
    console.log("Seeding Database...");

    try {
        // Seed Teachers
        for (const teacher of TEACHERS) {
            await setDoc(doc(db, "users", teacher.email.replace(/@|\./g, '_')), teacher);
            console.log(`Seeded Teacher: ${teacher.name}`);
        }

        // Seed Students
        for (const student of STUDENTS) {
            await setDoc(doc(db, "users", student.email.replace(/@|\./g, '_')), student);
            console.log(`Seeded Student: ${student.name}`);
        }

        // Seed Classrooms
        for (const room of CLASSROOMS) {
            await setDoc(doc(db, "classrooms", room.id), room);
            console.log(`Seeded Classroom: ${room.name}`);
        }

        console.log("Database Seeded Successfully!");
    } catch (error) {
        console.error("Error seeding database:", error);
    }
};
