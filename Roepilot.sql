-- phpMyAdmin SQL Dump
-- version 5.2.2
-- https://www.phpmyadmin.net/
--
-- Host: db
-- Generation Time: Mar 11, 2025 at 12:36 PM
-- Server version: 9.2.0
-- PHP Version: 8.2.27

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `Roepilot`
--

-- --------------------------------------------------------

--
-- Table structure for table `Answers`
--

CREATE TABLE `Answers` (
  `AnswerID` int NOT NULL,
  `RequestID` int NOT NULL,
  `UserID` int NOT NULL,
  `AnswerText` text NOT NULL,
  `PostDate` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `NumOfUpvote` tinyint(1) DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Dumping data for table `Answers`
--

INSERT INTO `Answers` (`AnswerID`, `RequestID`, `UserID`, `AnswerText`, `PostDate`, `NumOfUpvote`) VALUES
(1, 1, 2, 'A segmentation fault usually occurs due to invalid memory access. Check your pointers and array bounds.', '2025-03-11 12:24:18', 15),
(2, 1, 3, 'You can use a debugger like GDB to trace the source of the segmentation fault.', '2025-03-11 12:24:18', 10),
(3, 2, 1, 'Make sure you have installed all required libraries for your Python script.', '2025-03-11 12:24:18', 5),
(4, 2, 4, 'Check the error message and search for solutions online.', '2025-03-11 12:24:18', 3),
(5, 3, 1, 'Try restarting your device and reconnecting to the Wi-Fi network.', '2025-03-11 12:24:18', 20),
(6, 4, 3, 'Ensure the printer is turned on and has paper loaded.', '2025-03-11 12:24:18', 12);

-- --------------------------------------------------------

--
-- Table structure for table `Categories`
--

CREATE TABLE `Categories` (
  `CategoryID` int NOT NULL,
  `CategoryName` varchar(100) NOT NULL,
  `Description` text
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Dumping data for table `Categories`
--

INSERT INTO `Categories` (`CategoryID`, `CategoryName`, `Description`) VALUES
(1, 'Software', 'Issues related to software applications'),
(2, 'Hardware', 'Issues related to physical devices'),
(3, 'Networking', 'Issues related to network connectivity'),
(4, 'Programming', 'Issues related to coding and debugging'),
(5, 'University IT', 'Issues specific to Roehampton University IT systems');

-- --------------------------------------------------------

--
-- Table structure for table `SupportRequestCategories`
--

CREATE TABLE `SupportRequestCategories` (
  `RequestID` int NOT NULL,
  `CategoryID` int NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Dumping data for table `SupportRequestCategories`
--

INSERT INTO `SupportRequestCategories` (`RequestID`, `CategoryID`) VALUES
(1, 1),
(2, 1),
(4, 2),
(3, 3),
(1, 4),
(2, 4);

-- --------------------------------------------------------

--
-- Table structure for table `SupportRequests`
--

CREATE TABLE `SupportRequests` (
  `RequestID` int NOT NULL,
  `UserID` int NOT NULL,
  `Title` varchar(255) NOT NULL,
  `Description` text NOT NULL,
  `PostDate` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `IsResolved` tinyint(1) DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Dumping data for table `SupportRequests`
--

INSERT INTO `SupportRequests` (`RequestID`, `UserID`, `Title`, `Description`, `PostDate`, `IsResolved`) VALUES
(1, 1, 'How to debug a segmentation fault?', 'I am getting a segmentation fault in my C++ program.', '2025-03-11 12:20:04', 0),
(2, 2, 'Python script not running', 'My Python script is throwing an error when I try to run it.', '2025-03-11 12:20:04', 0),
(3, 3, 'Wi-Fi connection issues', 'I cannot connect to the university Wi-Fi network.', '2025-03-11 12:20:04', 0),
(4, 4, 'Printer not working', 'The printer in the library is not responding.', '2025-03-11 12:20:04', 1);

-- --------------------------------------------------------

--
-- Table structure for table `Users`
--

CREATE TABLE `Users` (
  `UserID` int NOT NULL,
  `Username` varchar(100) NOT NULL,
  `Email` varchar(255) NOT NULL,
  `PasswordHash` varchar(255) NOT NULL,
  `UniversityID` varchar(50) NOT NULL,
  `CredibilityScore` int DEFAULT '0',
  `RegistrationDate` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `IsActive` tinyint(1) DEFAULT '1'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Dumping data for table `Users`
--

INSERT INTO `Users` (`UserID`, `Username`, `Email`, `PasswordHash`, `UniversityID`, `CredibilityScore`, `RegistrationDate`, `IsActive`) VALUES
(1, 'johndoe', 'john.doe@roehampton.ac.uk', 'hashedpassword123', 'U123456', 50, '2025-03-11 12:19:20', 1),
(2, 'janedoe', 'jane.doe@roehampton.ac.uk', 'hashedpassword456', 'U654321', 75, '2025-03-11 12:19:20', 1),
(3, 'alicebrown', 'alice.brown@roehampton.ac.uk', 'hashedpassword789', 'U987654', 30, '2025-03-11 12:19:20', 1),
(4, 'bobsmith', 'bob.smith@roehampton.ac.uk', 'hashedpassword321', 'U456789', 20, '2025-03-11 12:19:20', 1);

--
-- Indexes for dumped tables
--

--
-- Indexes for table `Answers`
--
ALTER TABLE `Answers`
  ADD PRIMARY KEY (`AnswerID`),
  ADD KEY `RequestID` (`RequestID`),
  ADD KEY `UserID` (`UserID`);

--
-- Indexes for table `Categories`
--
ALTER TABLE `Categories`
  ADD PRIMARY KEY (`CategoryID`),
  ADD UNIQUE KEY `CategoryName` (`CategoryName`);

--
-- Indexes for table `SupportRequestCategories`
--
ALTER TABLE `SupportRequestCategories`
  ADD UNIQUE KEY `RequestID` (`RequestID`,`CategoryID`),
  ADD KEY `CategoryID` (`CategoryID`);

--
-- Indexes for table `SupportRequests`
--
ALTER TABLE `SupportRequests`
  ADD PRIMARY KEY (`RequestID`),
  ADD KEY `UserID` (`UserID`);

--
-- Indexes for table `Users`
--
ALTER TABLE `Users`
  ADD PRIMARY KEY (`UserID`),
  ADD UNIQUE KEY `Username` (`Username`),
  ADD UNIQUE KEY `Email` (`Email`),
  ADD UNIQUE KEY `UniversityID` (`UniversityID`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `Answers`
--
ALTER TABLE `Answers`
  MODIFY `AnswerID` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=7;

--
-- AUTO_INCREMENT for table `Categories`
--
ALTER TABLE `Categories`
  MODIFY `CategoryID` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=6;

--
-- AUTO_INCREMENT for table `SupportRequests`
--
ALTER TABLE `SupportRequests`
  MODIFY `RequestID` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT for table `Users`
--
ALTER TABLE `Users`
  MODIFY `UserID` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `Answers`
--
ALTER TABLE `Answers`
  ADD CONSTRAINT `answers_ibfk_1` FOREIGN KEY (`RequestID`) REFERENCES `SupportRequests` (`RequestID`),
  ADD CONSTRAINT `answers_ibfk_2` FOREIGN KEY (`UserID`) REFERENCES `Users` (`UserID`);

--
-- Constraints for table `SupportRequestCategories`
--
ALTER TABLE `SupportRequestCategories`
  ADD CONSTRAINT `supportrequestcategories_ibfk_1` FOREIGN KEY (`RequestID`) REFERENCES `SupportRequests` (`RequestID`),
  ADD CONSTRAINT `supportrequestcategories_ibfk_2` FOREIGN KEY (`CategoryID`) REFERENCES `Categories` (`CategoryID`);

--
-- Constraints for table `SupportRequests`
--
ALTER TABLE `SupportRequests`
  ADD CONSTRAINT `supportrequests_ibfk_1` FOREIGN KEY (`UserID`) REFERENCES `Users` (`UserID`);
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
