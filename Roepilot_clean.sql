-- Disable constraints temporarily to allow dropping/recreating tables smoothly
SET FOREIGN_KEY_CHECKS = 0;

-- Drop tables if they exist
DROP TABLE IF EXISTS `Notifications`;
DROP TABLE IF EXISTS `RequestTags`;
DROP TABLE IF EXISTS `Tags`;
DROP TABLE IF EXISTS `Answers`;
DROP TABLE IF EXISTS `SupportRequestCategories`;
DROP TABLE IF EXISTS `SupportRequests`;
DROP TABLE IF EXISTS `Categories`;
DROP TABLE IF EXISTS `Users`;

-- Create Users table
CREATE TABLE `Users` (
  `UserID` int NOT NULL AUTO_INCREMENT,
  `Username` varchar(100) NOT NULL,
  `Email` varchar(255) NOT NULL,
  `PasswordHash` varchar(255) NOT NULL,
  `UniversityID` varchar(50) NOT NULL,
  `CredibilityScore` int DEFAULT '0',
  `RegistrationDate` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `IsActive` tinyint(1) DEFAULT '1',
  PRIMARY KEY (`UserID`),
  UNIQUE KEY `Username` (`Username`),
  UNIQUE KEY `Email` (`Email`),
  UNIQUE KEY `UniversityID` (`UniversityID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Insert data into Users
INSERT INTO `Users` (`UserID`, `Username`, `Email`, `PasswordHash`, `UniversityID`, `CredibilityScore`, `RegistrationDate`, `IsActive`) VALUES
(1, 'johndoe', 'john.doe@roehampton.ac.uk', 'hashedpassword123', 'U123456', 50, '2025-03-11 12:19:20', 1),
(2, 'janedoe', 'jane.doe@roehampton.ac.uk', 'hashedpassword456', 'U654321', 75, '2025-03-11 12:19:20', 1),
(3, 'alicebrown', 'alice.brown@roehampton.ac.uk', 'hashedpassword789', 'U987654', 30, '2025-03-11 12:19:20', 1),
(4, 'bobsmith', 'bob.smith@roehampton.ac.uk', 'hashedpassword321', 'U456789', 20, '2025-03-11 12:19:20', 1);


-- Create Categories table
CREATE TABLE `Categories` (
  `CategoryID` int NOT NULL AUTO_INCREMENT,
  `CategoryName` varchar(100) NOT NULL,
  `Description` text,
  PRIMARY KEY (`CategoryID`),
  UNIQUE KEY `CategoryName` (`CategoryName`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Insert data into Categories
INSERT INTO `Categories` (`CategoryID`, `CategoryName`, `Description`) VALUES
(1, 'Software', 'Issues related to software applications'),
(2, 'Hardware', 'Issues related to physical devices'),
(3, 'Networking', 'Issues related to network connectivity'),
(4, 'Programming', 'Issues related to coding and debugging'),
(5, 'University IT', 'Issues specific to Roehampton University IT systems');


-- Create SupportRequests table
CREATE TABLE `SupportRequests` (
  `RequestID` int NOT NULL AUTO_INCREMENT,
  `UserID` int NOT NULL,
  `Title` varchar(255) NOT NULL,
  `Description` text NOT NULL,
  `BountyValue` int DEFAULT '0',
  `PostDate` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `IsResolved` tinyint(1) DEFAULT '0',
  PRIMARY KEY (`RequestID`),
  KEY `UserID` (`UserID`),
  CONSTRAINT `supportrequests_ibfk_1` FOREIGN KEY (`UserID`) REFERENCES `Users` (`UserID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Insert data into SupportRequests
INSERT INTO `SupportRequests` (`RequestID`, `UserID`, `Title`, `Description`, `PostDate`, `IsResolved`) VALUES
(1, 1, 'How to debug a segmentation fault?', 'I am getting a segmentation fault in my C++ program.', '2025-03-11 12:20:04', 0),
(2, 2, 'Python script not running', 'My Python script is throwing an error when I try to run it.', '2025-03-11 12:20:04', 0),
(3, 3, 'Wi-Fi connection issues', 'I cannot connect to the university Wi-Fi network.', '2025-03-11 12:20:04', 0),
(4, 4, 'Printer not working', 'The printer in the library is not responding.', '2025-03-11 12:20:04', 1);


-- Create SupportRequestCategories table
CREATE TABLE `SupportRequestCategories` (
  `RequestID` int NOT NULL,
  `CategoryID` int NOT NULL,
  UNIQUE KEY `RequestID` (`RequestID`,`CategoryID`),
  KEY `CategoryID` (`CategoryID`),
  CONSTRAINT `supportrequestcategories_ibfk_1` FOREIGN KEY (`RequestID`) REFERENCES `SupportRequests` (`RequestID`),
  CONSTRAINT `supportrequestcategories_ibfk_2` FOREIGN KEY (`CategoryID`) REFERENCES `Categories` (`CategoryID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Insert data into SupportRequestCategories
INSERT INTO `SupportRequestCategories` (`RequestID`, `CategoryID`) VALUES
(1, 1),
(2, 1),
(4, 2),
(3, 3),
(1, 4),
(2, 4);


-- Create Answers table
CREATE TABLE `Answers` (
  `AnswerID` int NOT NULL AUTO_INCREMENT,
  `RequestID` int NOT NULL,
  `UserID` int NOT NULL,
  `AnswerText` text NOT NULL,
  `PostDate` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `NumOfUpvote` tinyint(1) DEFAULT '0',
  `IsAccepted` tinyint(1) DEFAULT '0',
  PRIMARY KEY (`AnswerID`),
  KEY `RequestID` (`RequestID`),
  KEY `UserID` (`UserID`),
  CONSTRAINT `answers_ibfk_1` FOREIGN KEY (`RequestID`) REFERENCES `SupportRequests` (`RequestID`),
  CONSTRAINT `answers_ibfk_2` FOREIGN KEY (`UserID`) REFERENCES `Users` (`UserID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Insert data into Answers
INSERT INTO `Answers` (`AnswerID`, `RequestID`, `UserID`, `AnswerText`, `PostDate`, `NumOfUpvote`, `IsAccepted`) VALUES
(1, 1, 2, 'A segmentation fault usually occurs due to invalid memory access. Check your pointers and array bounds.', '2025-03-11 12:24:18', 15, 0),
(2, 1, 3, 'You can use a debugger like GDB to trace the source of the segmentation fault.', '2025-03-11 12:24:18', 10, 0),
(3, 2, 1, 'Make sure you have installed all required libraries for your Python script.', '2025-03-11 12:24:18', 5, 0),
(4, 2, 4, 'Check the error message and search for solutions online.', '2025-03-11 12:24:18', 3, 0),
(5, 3, 1, 'Try restarting your device and reconnecting to the Wi-Fi network.', '2025-03-11 12:24:18', 20, 0),
(6, 4, 3, 'Ensure the printer is turned on and has paper loaded.', '2025-03-11 12:24:18', 12, 0);

-- Create Tags table
CREATE TABLE `Tags` (
  `TagID` int NOT NULL AUTO_INCREMENT,
  `TagName` varchar(50) NOT NULL,
  PRIMARY KEY (`TagID`),
  UNIQUE KEY `TagName` (`TagName`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO `Tags` (`TagID`, `TagName`) VALUES 
(1, 'software'), (2, 'programming'), (3, 'high-priority'), (4, 'network');

-- Create RequestTags table
CREATE TABLE `RequestTags` (
  `RequestID` int NOT NULL,
  `TagID` int NOT NULL,
  UNIQUE KEY `RequestTag` (`RequestID`, `TagID`),
  CONSTRAINT `requesttags_ibfk_1` FOREIGN KEY (`RequestID`) REFERENCES `SupportRequests` (`RequestID`) ON DELETE CASCADE,
  CONSTRAINT `requesttags_ibfk_2` FOREIGN KEY (`TagID`) REFERENCES `Tags` (`TagID`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO `RequestTags` (`RequestID`, `TagID`) VALUES (1, 1), (1, 2), (1, 3);

-- Create Notifications table
CREATE TABLE `Notifications` (
  `NotificationID` int NOT NULL AUTO_INCREMENT,
  `UserID` int NOT NULL,
  `Message` varchar(255) NOT NULL,
  `Link` varchar(255) DEFAULT '',
  `IsRead` tinyint(1) DEFAULT '0',
  `CreatedAt` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`NotificationID`),
  CONSTRAINT `notifications_ibfk_1` FOREIGN KEY (`UserID`) REFERENCES `Users` (`UserID`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;


-- Re-enable constraints
SET FOREIGN_KEY_CHECKS = 1;

